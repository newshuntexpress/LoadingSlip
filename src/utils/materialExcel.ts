import { readSheet } from 'read-excel-file/browser';
import writeXlsxFile from 'write-excel-file/browser';
import type { SheetData } from 'write-excel-file/browser';
import { MaterialMasterRecord } from '../types';

export interface ParsedExcelMaterialRow {
  rowNumber: number;
  materialName: string;
  packType: string;
  palletRatio: number;
  remarks: string;
}

export interface ParsedExcelMaterialResult {
  validRows: ParsedExcelMaterialRow[];
  invalidRows: Array<{ rowNumber: number; reason: string }>;
  detectedHeaders: string[];
  fileName: string;
}

const STANDARD_PACK_TYPES = ['Can', 'Drum', 'Board', 'EA', 'KG', 'Rolls', 'Pallet', 'Box'];
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

function normalizePackTypeClient(raw: unknown): string {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) return 'Rolls';
  const match = STANDARD_PACK_TYPES.find((p) => p.toLowerCase() === trimmed.toLowerCase());
  if (match) return match;
  return trimmed.toUpperCase().slice(0, 40);
}

function parseRatioValue(raw: unknown): number | null {
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw) || raw < 1 || raw > 10000) return null;
    return Math.round(raw);
  }
  const str = String(raw ?? '').trim();
  if (!str) return null;
  // Prefer number after '=' if user formatted as "1 Pallet = 23" or "1P = 100"
  const eqMatch = str.match(/=\s*(\d+(?:\.\d+)?)/);
  if (eqMatch) {
    const val = Math.round(Number(eqMatch[1]));
    return val >= 1 && val <= 10000 ? val : null;
  }
  const numMatch = str.match(/(\d+(?:\.\d+)?)/);
  if (!numMatch) return null;
  const val = Math.round(Number(numMatch[1]));
  return Number.isFinite(val) && val >= 1 && val <= 10000 ? val : null;
}

function parseDelimitedText(text: string): string[][] {
  const clean = text.replace(/^\uFEFF/, '');
  const firstLine = clean.split(/\r?\n/)[0] || '';
  const tabCount = (firstLine.match(/\t/g) || []).length;
  const semiCount = (firstLine.match(/;/g) || []).length;
  const commaCount = (firstLine.match(/,/g) || []).length;
  const delimiter = tabCount > commaCount && tabCount >= semiCount ? '\t' : semiCount > commaCount ? ';' : ',';

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (inQuotes) {
      if (ch === '"' && clean[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(cell.trim());
      cell = '';
    } else if (ch === '\r') {
      if (clean[i + 1] === '\n') i++;
      row.push(cell.trim());
      rows.push(row);
      row = [];
      cell = '';
    } else if (ch === '\n') {
      row.push(cell.trim());
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell.trim());
    rows.push(row);
  }
  return rows;
}

function parseHtmlTableXls(html: string): string[][] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const trs = Array.from(doc.querySelectorAll('table tr'));
  return trs.map((tr) =>
    Array.from(tr.querySelectorAll('th, td')).map((td) => (td.textContent || '').trim())
  );
}

function normalizeHeaderKey(raw: unknown): string {
  return String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
}

function findColumnMapping(rawRows: unknown[][]): {
  headerRowIdx: number;
  nameCol: number;
  packCol: number;
  ratioCol: number;
  remarksCol: number;
  headers: string[];
} {
  const scanLimit = Math.min(rawRows.length, 6);
  for (let r = 0; r < scanLimit; r++) {
    const cells = (rawRows[r] || []).map(normalizeHeaderKey);
    let nameCol = -1;
    let packCol = -1;
    let ratioCol = -1;
    let remarksCol = -1;

    cells.forEach((h, cIdx) => {
      if (!h) return;
      if (
        nameCol === -1 &&
        (h.includes('material name') ||
          h.includes('material desc') ||
          h === 'material' ||
          h.includes('item name') ||
          h.includes('item desc') ||
          h === 'description' ||
          h === 'product' ||
          h === 'sku' ||
          h === 'name')
      ) {
        nameCol = cIdx;
      } else if (
        packCol === -1 &&
        (h.includes('pack type') || h === 'pack' || h === 'uom' || h === 'unit' || h.includes('packing'))
      ) {
        packCol = cIdx;
      } else if (
        ratioCol === -1 &&
        (h.includes('pallet ratio') ||
          h.includes('auto pallet') ||
          h.includes('1 pallet') ||
          h.includes('ratio') ||
          h.includes('per pallet') ||
          h.includes('rolls/pallet') ||
          h.includes('qty/pallet') ||
          h === 'pallet')
      ) {
        ratioCol = cIdx;
      } else if (
        remarksCol === -1 &&
        (h.includes('remark') || h.includes('batch') || h.includes('grade') || h.includes('note'))
      ) {
        remarksCol = cIdx;
      }
    });

    if (nameCol !== -1 && (packCol !== -1 || ratioCol !== -1)) {
      return {
        headerRowIdx: r,
        nameCol,
        packCol,
        ratioCol,
        remarksCol,
        headers: (rawRows[r] || []).map((v) => String(v ?? '').trim()).filter(Boolean),
      };
    }
  }

  // Fallback positional mapping (no explicit header row found)
  return {
    headerRowIdx: -1,
    nameCol: 0,
    packCol: 1,
    ratioCol: 2,
    remarksCol: 3,
    headers: ['Column A (Material Name)', 'Column B (Pack Type)', 'Column C (Auto-Pallet Ratio)', 'Column D (Remarks)'],
  };
}

export async function parseMaterialExcelFile(file: File): Promise<ParsedExcelMaterialResult> {
  if (!file) {
    throw new Error('No file selected.');
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error('File is too large. Maximum allowed file size is 5 MB.');
  }

  const lowerName = (file.name || '').toLowerCase();
  let rawRows: unknown[][] = [];

  if (lowerName.endsWith('.xlsx')) {
    try {
      rawRows = await readSheet(file);
    } catch {
      throw new Error('Unable to read .xlsx file. Please make sure it is a valid Excel (.xlsx) workbook.');
    }
  } else if (lowerName.endsWith('.csv') || lowerName.endsWith('.tsv') || lowerName.endsWith('.txt')) {
    const text = await file.text();
    rawRows = parseDelimitedText(text);
  } else if (lowerName.endsWith('.xls')) {
    // Check if legacy .xls is actually HTML table or delimited text (common ERP export); reject binary BIFF .xls cleanly
    const buf = new Uint8Array(await file.slice(0, 8).arrayBuffer());
    const isOle2Binary =
      buf.length >= 8 &&
      buf[0] === 0xd0 &&
      buf[1] === 0xcf &&
      buf[2] === 0x11 &&
      buf[3] === 0xe0;
    if (isOle2Binary) {
      throw new Error(
        'Legacy binary .xls format is not supported directly. Please open it in Excel and Save As ".xlsx" or ".csv", then upload again.'
      );
    }
    const text = await file.text();
    rawRows = /<table[\s>]/i.test(text) ? parseHtmlTableXls(text) : parseDelimitedText(text);
  } else {
    throw new Error('Unsupported file type. Please upload an Excel (.xlsx) or CSV (.csv) file.');
  }

  const nonEmptyRows = rawRows.filter((row) =>
    Array.isArray(row) && row.some((cell) => String(cell ?? '').trim() !== '')
  );

  if (nonEmptyRows.length === 0) {
    throw new Error('The uploaded Excel file is empty.');
  }

  const mapping = findColumnMapping(nonEmptyRows);
  const startRow = mapping.headerRowIdx >= 0 ? mapping.headerRowIdx + 1 : 0;

  const validRows: ParsedExcelMaterialRow[] = [];
  const invalidRows: Array<{ rowNumber: number; reason: string }> = [];

  for (let i = startRow; i < nonEmptyRows.length; i++) {
    const row = nonEmptyRows[i] || [];
    const excelRowNum = i + 1;
    const rawName = String(row[mapping.nameCol] ?? '').trim().toUpperCase();
    const rawPack = mapping.packCol >= 0 ? row[mapping.packCol] : '';
    const rawRatio = mapping.ratioCol >= 0 ? row[mapping.ratioCol] : '';
    const rawRemarks = mapping.remarksCol >= 0 ? String(row[mapping.remarksCol] ?? '').trim().toUpperCase() : '';

    // Skip Sr. No. only / summary rows if name is completely blank
    if (!rawName) {
      invalidRows.push({ rowNumber: excelRowNum, reason: 'Missing Material Name' });
      continue;
    }

    // Skip repeated header lines if pasted mid-sheet
    if (normalizeHeaderKey(rawName) === 'material name' || normalizeHeaderKey(rawName) === 'material description') {
      continue;
    }

    const parsedRatio = parseRatioValue(rawRatio);
    if (parsedRatio === null) {
      invalidRows.push({
        rowNumber: excelRowNum,
        reason: `${rawName}: Invalid or missing Auto-Pallet Ratio (${String(rawRatio ?? '').trim() || 'blank'})`,
      });
      continue;
    }

    validRows.push({
      rowNumber: excelRowNum,
      materialName: rawName.slice(0, 120),
      packType: normalizePackTypeClient(rawPack),
      palletRatio: parsedRatio,
      remarks: rawRemarks.slice(0, 160),
    });
  }

  return {
    validRows,
    invalidRows,
    detectedHeaders: mapping.headers,
    fileName: file.name,
  };
}

export async function downloadMaterialMasterTemplateXlsx(): Promise<void> {
  const data: SheetData = [
    [
      { value: 'Material Name', fontWeight: 'bold', backgroundColor: '#1E293B', textColor: '#FFFFFF' },
      { value: 'Pack Type', fontWeight: 'bold', backgroundColor: '#1E293B', textColor: '#FFFFFF' },
      { value: 'Auto-Pallet Ratio (1 Pallet =)', fontWeight: 'bold', backgroundColor: '#1E293B', textColor: '#FFFFFF' },
      { value: 'Default Remarks', fontWeight: 'bold', backgroundColor: '#1E293B', textColor: '#FFFFFF' },
    ],
    [
      { type: String, value: 'DS40200' },
      { type: String, value: 'Rolls' },
      { type: Number, value: 23 },
      { type: String, value: 'BITUMINOUS MEMBRANE' },
    ],
    [
      { type: String, value: 'DS40250' },
      { type: String, value: 'Rolls' },
      { type: Number, value: 23 },
      { type: String, value: 'BITUMINOUS MEMBRANE' },
    ],
    [
      { type: String, value: 'MS60' },
      { type: String, value: 'Board' },
      { type: Number, value: 100 },
      { type: String, value: 'PROTECTION BOARD' },
    ],
  ];

  await writeXlsxFile(data, {
    sheet: 'Material Master',
    columns: [{ width: 28 }, { width: 16 }, { width: 28 }, { width: 32 }],
  }).toFile('Material_Master_Template.xlsx');
}

export async function exportMaterialMasterXlsx(materials: MaterialMasterRecord[]): Promise<void> {
  const data: SheetData = [
    [
      { value: 'Sr No', fontWeight: 'bold', backgroundColor: '#354A5F', textColor: '#FFFFFF' },
      { value: 'Material Name', fontWeight: 'bold', backgroundColor: '#354A5F', textColor: '#FFFFFF' },
      { value: 'Pack Type', fontWeight: 'bold', backgroundColor: '#354A5F', textColor: '#FFFFFF' },
      { value: 'Auto-Pallet Ratio (1 Pallet =)', fontWeight: 'bold', backgroundColor: '#354A5F', textColor: '#FFFFFF' },
      { value: 'Default Remarks', fontWeight: 'bold', backgroundColor: '#354A5F', textColor: '#FFFFFF' },
      { value: 'Updated By', fontWeight: 'bold', backgroundColor: '#354A5F', textColor: '#FFFFFF' },
    ],
    ...materials.map((m, idx) => [
      { type: Number, value: idx + 1 },
      { type: String, value: m.materialName },
      { type: String, value: m.packType },
      { type: Number, value: m.palletRatio },
      { type: String, value: m.remarks || '' },
      { type: String, value: m.updatedBy || m.createdBy || '' },
    ]),
  ];

  const today = new Date().toISOString().split('T')[0];
  await writeXlsxFile(data, {
    sheet: 'Material Master',
    columns: [{ width: 10 }, { width: 30 }, { width: 16 }, { width: 28 }, { width: 32 }, { width: 18 }],
  }).toFile(`Material_Master_${today}.xlsx`);
}
