import React, { useMemo, useRef, useState } from 'react';
import { MaterialMasterRecord, CompanySettings } from '../types';
import { ApiClient } from '../services/api';
import { StorageService } from '../services/storage';
import { PACK_DROPDOWN_OPTIONS } from './LoadingSlipModal';
import {
  parseMaterialExcelFile,
  downloadMaterialMasterTemplateXlsx,
  exportMaterialMasterXlsx,
  type ParsedExcelMaterialResult,
} from '../utils/materialExcel';
import {
  Layers,
  Plus,
  Edit2,
  Trash2,
  Search,
  Save,
  X,
  Download,
  Upload,
  FileSpreadsheet,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Lock,
} from 'lucide-react';

interface MaterialMasterViewProps {
  materials: MaterialMasterRecord[];
  settings: CompanySettings;
  canManage: boolean;
  onMaterialsChange: (materials: MaterialMasterRecord[]) => void;
  onRefresh: () => Promise<void>;
}

export const MaterialMasterView: React.FC<MaterialMasterViewProps> = ({
  materials,
  settings,
  canManage,
  onMaterialsChange,
  onRefresh,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [packFilter, setPackFilter] = useState('ALL');
  const [editingId, setEditingId] = useState<string | null>(null);

  const [materialName, setMaterialName] = useState('');
  const [packType, setPackType] = useState('Rolls');
  const [customPackType, setCustomPackType] = useState('');
  const [palletRatio, setPalletRatio] = useState('23');
  const [remarks, setRemarks] = useState('');

  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<MaterialMasterRecord | null>(null);

  // Excel Upload & Preview state
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [parsingExcel, setParsingExcel] = useState(false);
  const [importingExcel, setImportingExcel] = useState(false);
  const [excelError, setExcelError] = useState<string | null>(null);
  const [parsedExcel, setParsedExcel] = useState<ParsedExcelMaterialResult | null>(null);
  const [importMode, setImportMode] = useState<'upsert' | 'skip_existing'>('upsert');
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3500);
  };

  const resetForm = () => {
    setEditingId(null);
    setMaterialName('');
    setPackType('Rolls');
    setCustomPackType('');
    setPalletRatio('23');
    setRemarks('');
    setErrorMsg(null);
  };

  const handleStartEdit = (mat: MaterialMasterRecord) => {
    setErrorMsg(null);
    setEditingId(mat.id);
    setMaterialName(mat.materialName);
    if (PACK_DROPDOWN_OPTIONS.includes(mat.packType)) {
      setPackType(mat.packType);
      setCustomPackType('');
    } else {
      setPackType('__CUSTOM__');
      setCustomPackType(mat.packType);
    }
    setPalletRatio(String(mat.palletRatio || 23));
    setRemarks(mat.remarks || '');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const resolvedPackType = packType === '__CUSTOM__' ? customPackType.trim().toUpperCase() : packType.trim();

  const duplicateMaterialMatch = useMemo(() => {
    const clean = materialName.trim().toUpperCase();
    if (!clean) return null;
    return (
      materials.find(
        (m) => m.id !== editingId && m.materialName.trim().toUpperCase() === clean
      ) || null
    );
  }, [materials, materialName, editingId]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManage || saving) return;
    setErrorMsg(null);

    const cleanName = materialName.trim().toUpperCase();
    const cleanPack = resolvedPackType;
    const ratioNum = Number(palletRatio);

    if (!cleanName) {
      setErrorMsg('Please enter Material Name.');
      return;
    }
    if (duplicateMaterialMatch) {
      setErrorMsg(
        `Warning: Material "${duplicateMaterialMatch.materialName}" is already saved in Material Master (${duplicateMaterialMatch.packType}, 1 Pallet = ${duplicateMaterialMatch.palletRatio}). Duplicate names are not allowed.`
      );
      return;
    }
    if (!cleanPack) {
      setErrorMsg('Please select or enter Pack Type.');
      return;
    }
    if (!Number.isFinite(ratioNum) || ratioNum < 1 || ratioNum > 10000) {
      setErrorMsg('Auto-Pallet Ratio (1 Pallet =) must be a number between 1 and 10,000.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        materialName: cleanName,
        packType: cleanPack,
        palletRatio: Math.round(ratioNum),
        remarks: remarks.trim().toUpperCase(),
      };

      if (editingId) {
        const updated = await ApiClient.updateMaterial(editingId, payload);
        const nextList = materials
          .map((m) => (m.id === editingId ? updated : m))
          .sort((a, b) => a.materialName.localeCompare(b.materialName));
        StorageService.saveMaterials(nextList);
        onMaterialsChange(nextList);
        showToast(`Updated "${updated.materialName}" (${updated.packType}, 1 Pallet = ${updated.palletRatio}).`);
        resetForm();
      } else {
        const created = await ApiClient.createMaterial(payload);
        const nextList = [...materials.filter((m) => m.id !== created.id), created].sort((a, b) =>
          a.materialName.localeCompare(b.materialName)
        );
        StorageService.saveMaterials(nextList);
        onMaterialsChange(nextList);
        showToast(`Saved "${created.materialName}" (${created.packType}, 1 Pallet = ${created.palletRatio}).`);
        resetForm();
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Unable to save Material Master record.');
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!confirmDelete || !canManage || saving) return;
    setSaving(true);
    setErrorMsg(null);
    try {
      await ApiClient.deleteMaterial(confirmDelete.id);
      const nextList = materials.filter((m) => m.id !== confirmDelete.id);
      StorageService.saveMaterials(nextList);
      onMaterialsChange(nextList);
      showToast(`Deleted "${confirmDelete.materialName}" from Material Master.`);
      if (editingId === confirmDelete.id) {
        resetForm();
      }
      setConfirmDelete(null);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to delete Material Master record.');
      setConfirmDelete(null);
    } finally {
      setSaving(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await onRefresh();
      showToast('Material Master synchronized.');
    } finally {
      setRefreshing(false);
    }
  };

  const availablePackTypes = useMemo(() => {
    const set = new Set<string>();
    for (const m of materials) {
      if (m.packType) set.add(m.packType);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [materials]);

  const filteredMaterials = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return materials.filter((m) => {
      if (packFilter !== 'ALL' && m.packType !== packFilter) return false;
      if (!q) return true;
      return (
        m.materialName.toLowerCase().includes(q) ||
        m.packType.toLowerCase().includes(q) ||
        String(m.palletRatio).includes(q) ||
        (m.remarks || '').toLowerCase().includes(q)
      );
    });
  }, [materials, searchQuery, packFilter]);

  const handleExportCSV = () => {
    const headers = ['Sr No', 'Material Name', 'Pack Type', 'Auto-Pallet Ratio (1 Pallet =)', 'Default Remarks', 'Updated By'];
    const rows = filteredMaterials.map((m, i) => [
      String(i + 1),
      m.materialName,
      m.packType,
      String(m.palletRatio),
      m.remarks || '',
      m.updatedBy || m.createdBy || '',
    ]);
    const csv = [headers, ...rows]
      .map((r) => r.map((cell) => `"${String(cell || '').replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Material_Master_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Material Master exported to CSV.');
  };

  const handleExportExcel = async () => {
    if (filteredMaterials.length === 0) return;
    try {
      await exportMaterialMasterXlsx(filteredMaterials);
      showToast('Material Master exported to Excel (.xlsx).');
    } catch (err: any) {
      setErrorMsg(err?.message || 'Unable to export Excel file.');
    }
  };

  const handleDownloadSampleExcel = async () => {
    try {
      await downloadMaterialMasterTemplateXlsx();
      showToast('Sample Excel template (.xlsx) downloaded.');
    } catch (err: any) {
      setErrorMsg(err?.message || 'Unable to generate Excel template.');
    }
  };

  const existingMaterialNames = useMemo(() => {
    const set = new Set<string>();
    for (const m of materials) {
      set.add(m.materialName.trim().toUpperCase());
    }
    return set;
  }, [materials]);

  const excelSummary = useMemo(() => {
    if (!parsedExcel) return { newCount: 0, existingCount: 0 };
    let newCount = 0;
    let existingCount = 0;
    for (const row of parsedExcel.validRows) {
      if (existingMaterialNames.has(row.materialName.trim().toUpperCase())) {
        existingCount++;
      } else {
        newCount++;
      }
    }
    return { newCount, existingCount };
  }, [parsedExcel, existingMaterialNames]);

  const openUploadModal = () => {
    setExcelError(null);
    setParsedExcel(null);
    setImportMode('upsert');
    setUploadModalOpen(true);
  };

  const closeUploadModal = () => {
    if (importingExcel) return;
    setUploadModalOpen(false);
    setParsedExcel(null);
    setExcelError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleProcessExcelFile = async (file: File | null | undefined) => {
    if (!file || parsingExcel || importingExcel) return;
    setExcelError(null);
    setParsedExcel(null);
    setParsingExcel(true);
    try {
      const result = await parseMaterialExcelFile(file);
      if (result.validRows.length === 0 && result.invalidRows.length === 0) {
        setExcelError('No material rows found in the uploaded file.');
      } else {
        setParsedExcel(result);
      }
    } catch (err: any) {
      setExcelError(err?.message || 'Failed to parse Excel file.');
    } finally {
      setParsingExcel(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleConfirmExcelImport = async () => {
    if (!parsedExcel || parsedExcel.validRows.length === 0 || !canManage || importingExcel) return;
    setImportingExcel(true);
    setExcelError(null);
    try {
      const items = parsedExcel.validRows.map((row) => ({
        materialName: row.materialName,
        packType: row.packType,
        palletRatio: row.palletRatio,
        remarks: row.remarks,
      }));
      const res = await ApiClient.importMaterials({ items, mode: importMode });
      StorageService.saveMaterials(res.materials);
      onMaterialsChange(res.materials);
      setUploadModalOpen(false);
      setParsedExcel(null);
      showToast(
        `Excel imported: ${res.insertedCount} added, ${res.updatedCount} updated, ${res.skippedCount} skipped.`
      );
    } catch (err: any) {
      setExcelError(err?.message || 'Failed to import materials to server.');
    } finally {
      setImportingExcel(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header Banner */}
      <div className="surface-3d rounded-2xl p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex items-center gap-3.5 min-w-0">
          {settings.logoDataUrl ? (
            <div className="w-11 h-11 rounded-xl bg-white flex items-center justify-center shrink-0 ring-2 ring-[#F0AB00]/70 overflow-hidden p-1 shadow-[0_3px_0_#C5D3E2]">
              <img src={settings.logoDataUrl} alt={settings.companyName} className="w-full h-full object-contain" />
            </div>
          ) : (
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#0A6ED1] to-[#084B8A] text-white flex items-center justify-center shrink-0 ring-2 ring-[#F0AB00]/60 shadow-[0_3px_0_#063E75]">
              <Layers className="w-5 h-5" />
            </div>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg sm:text-xl font-black text-[#1C2833] tracking-tight">
                Material Master
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-extrabold bg-[#EAF3FD] text-[#0A6ED1] border border-[#BFD7F2]">
                {materials.length} Materials
              </span>
              {!canManage && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-300">
                  <Lock className="w-3 h-3" />
                  View Only
                </span>
              )}
            </div>
            <p className="text-xs text-[#5B738B] mt-0.5">
              Maintain Material Name, Pack Type &amp; Auto-Pallet Ratio (1 Pallet =) for instant search &amp; auto-fill inside Loading Slips
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canManage && (
            <>
              <button
                type="button"
                onClick={openUploadModal}
                className="app-btn-sm bg-[#0A6ED1] hover:bg-[#085CAF] text-white"
              >
                <Upload className="w-4 h-4 shrink-0" />
                <span>Upload Excel</span>
              </button>
              <button
                type="button"
                onClick={handleDownloadSampleExcel}
                className="app-btn-sm bg-white hover:bg-[#EFF4F9] text-[#1C2833] border border-[#C8D6E5]"
                title="Download sample .xlsx template for bulk upload"
              >
                <FileSpreadsheet className="w-4 h-4 shrink-0 text-[#107E3E]" />
                <span>Sample Excel</span>
              </button>
            </>
          )}
          <button
            type="button"
            onClick={handleExportExcel}
            disabled={filteredMaterials.length === 0}
            className="app-btn-sm bg-[#107E3E] hover:bg-[#0D6A34] text-white disabled:opacity-50"
          >
            <FileSpreadsheet className="w-4 h-4 shrink-0" />
            <span>Export Excel</span>
          </button>
          <button
            type="button"
            onClick={handleExportCSV}
            disabled={filteredMaterials.length === 0}
            className="app-btn-sm bg-white hover:bg-[#EFF4F9] text-[#1C2833] border border-[#C8D6E5] disabled:opacity-50"
          >
            <Download className="w-4 h-4 shrink-0" />
            <span>Export CSV</span>
          </button>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            className="app-btn-sm bg-white hover:bg-[#EFF4F9] text-[#1C2833] border border-[#C8D6E5]"
          >
            <RefreshCw className={`w-4 h-4 shrink-0 ${refreshing ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Toast & Error Alerts */}
      {toastMsg && (
        <div className="bg-emerald-50 border border-emerald-300 text-emerald-900 px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 shadow-sm">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{toastMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="bg-red-50 border border-red-300 text-red-800 px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 shadow-sm">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Add / Edit Form */}
      {canManage && (
        <form onSubmit={handleSave} className="surface-3d rounded-2xl p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between gap-2 border-b border-[#E3EAF2] pb-2.5">
            <h3 className="text-xs font-black uppercase tracking-wider text-[#1C2833] flex items-center gap-2">
              {editingId ? (
                <>
                  <Edit2 className="w-4 h-4 text-[#0A6ED1]" />
                  <span>Edit Material Master Record</span>
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4 text-[#107E3E]" />
                  <span>Add New Material to Master</span>
                </>
              )}
            </h3>
            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="text-xs font-bold text-[#5B738B] hover:text-[#1C2833] inline-flex items-center gap-1 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
                <span>Cancel Edit</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            <div>
              <label className="text-[11px] font-extrabold uppercase tracking-wide text-[#354A5F] block mb-1">
                Material Name / Description *
              </label>
              <input
                type="text"
                value={materialName}
                onChange={(e) => {
                  setMaterialName(e.target.value);
                  if (errorMsg) setErrorMsg(null);
                }}
                placeholder="e.g. DS40200 or AWP PRIMER"
                className={`w-full px-3 py-2 text-sm font-bold uppercase rounded-xl border bg-white focus:outline-none ${
                  duplicateMaterialMatch
                    ? 'border-amber-500 ring-2 ring-amber-400/30 bg-amber-50/40'
                    : 'border-[#C8D6E5] focus:border-[#0A6ED1] focus:ring-2 focus:ring-[#0A6ED1]/20'
                }`}
                required
              />
            </div>

            <div>
              <label className="text-[11px] font-extrabold uppercase tracking-wide text-[#354A5F] block mb-1">
                Pack Type *
              </label>
              <div className="space-y-1.5">
                <select
                  value={packType}
                  onChange={(e) => setPackType(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-bold rounded-xl border border-[#C8D6E5] bg-white focus:border-[#0A6ED1] focus:ring-2 focus:ring-[#0A6ED1]/20 focus:outline-none"
                >
                  {PACK_DROPDOWN_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                  <option value="__CUSTOM__">Other / Custom</option>
                </select>
                {packType === '__CUSTOM__' && (
                  <input
                    type="text"
                    value={customPackType}
                    onChange={(e) => setCustomPackType(e.target.value)}
                    placeholder="Enter custom pack type"
                    className="w-full px-3 py-1.5 text-xs font-bold uppercase rounded-lg border border-blue-400 bg-blue-50/50 focus:outline-none"
                    required
                  />
                )}
              </div>
            </div>

            <div>
              <label className="text-[11px] font-extrabold uppercase tracking-wide text-[#7F5200] block mb-1">
                Auto-Pallet Ratio (1 Pallet =) *
              </label>
              <div className="flex items-center gap-2 bg-amber-50 border border-amber-300 rounded-xl px-3 py-1.5">
                <span className="text-xs font-black text-amber-900 whitespace-nowrap">1 Pallet =</span>
                <input
                  type="number"
                  min={1}
                  max={10000}
                  value={palletRatio}
                  onChange={(e) => setPalletRatio(e.target.value)}
                  placeholder="23"
                  className="w-full px-2 py-0.5 text-sm text-center font-black text-amber-950 bg-white border border-amber-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                  required
                />
                <span className="text-xs font-bold text-amber-800 whitespace-nowrap">
                  {resolvedPackType || 'Units'}
                </span>
              </div>
            </div>

            <div>
              <label className="text-[11px] font-extrabold uppercase tracking-wide text-[#354A5F] block mb-1">
                Default Remarks / Batch (Optional)
              </label>
              <input
                type="text"
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder="e.g. Grade A / Standard Roll"
                className="w-full px-3 py-2 text-sm font-medium uppercase rounded-xl border border-[#C8D6E5] bg-white focus:border-[#0A6ED1] focus:ring-2 focus:ring-[#0A6ED1]/20 focus:outline-none"
              />
            </div>
          </div>

          {duplicateMaterialMatch && (
            <div className="bg-amber-50 border border-amber-300 text-amber-950 px-3.5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                Warning: Material &quot;{duplicateMaterialMatch.materialName}&quot; is already saved in Material Master (
                {duplicateMaterialMatch.packType}, 1 Pallet = {duplicateMaterialMatch.palletRatio}). Duplicate names cannot be saved.
              </span>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <p className="text-[11px] text-[#5B738B]">
              Saving adds this material to the Loading Slip search box so typing its name automatically fills <strong>Pack Type</strong> &amp; <strong>Auto-Pallet Ratio</strong>.
            </p>
            <div className="flex items-center gap-2">
              {editingId && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="app-btn-sm bg-white hover:bg-[#EFF4F9] text-[#354A5F] border border-[#C8D6E5]"
                >
                  <X className="w-4 h-4 shrink-0" />
                  <span>Cancel</span>
                </button>
              )}
              <button
                type="submit"
                disabled={saving || Boolean(duplicateMaterialMatch)}
                className="app-btn-sm bg-[#0A6ED1] hover:bg-[#085CAF] text-white disabled:opacity-50"
              >
                <Save className="w-4 h-4 shrink-0" />
                <span>{saving ? 'Saving...' : editingId ? 'Update Material' : 'Save Material'}</span>
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Search & Filter Toolbar */}
      <div className="surface-3d rounded-2xl p-3.5 sm:p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-[#5B738B] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search material name, pack type, ratio or remarks..."
              data-preserve-case="true"
              className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm rounded-xl border border-[#C8D6E5] bg-white focus:border-[#0A6ED1] focus:ring-2 focus:ring-[#0A6ED1]/20 focus:outline-none"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={packFilter}
              onChange={(e) => setPackFilter(e.target.value)}
              className="px-3 py-2 text-xs font-bold rounded-xl border border-[#C8D6E5] bg-white text-[#1C2833] focus:outline-none"
            >
              <option value="ALL">All Pack Types ({materials.length})</option>
              {availablePackTypes.map((p) => (
                <option key={p} value={p}>
                  Pack: {p}
                </option>
              ))}
            </select>
            <span className="px-2.5 py-1.5 rounded-xl bg-[#F4F7FA] border border-[#DCE5EF] text-xs font-extrabold text-[#354A5F]">
              Showing {filteredMaterials.length} of {materials.length}
            </span>
          </div>
        </div>

        {/* Table */}
        <div className="border border-[#DCE5EF] rounded-xl overflow-hidden bg-white">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="bg-[#354A5F] text-white text-[11px] uppercase tracking-wider">
                  <th className="py-2.5 px-3 w-12 text-center">#</th>
                  <th className="py-2.5 px-3">Material Name</th>
                  <th className="py-2.5 px-3 w-32 text-center">Pack Type</th>
                  <th className="py-2.5 px-3 w-52 text-center">Auto-Pallet Ratio (1 Pallet =)</th>
                  <th className="py-2.5 px-3 w-36">Updated By</th>
                  {canManage && <th className="py-2.5 px-3 w-28 text-center">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E3EAF2]">
                {filteredMaterials.length === 0 ? (
                  <tr>
                    <td
                      colSpan={canManage ? 6 : 5}
                      className="py-8 px-4 text-center text-xs font-semibold text-[#5B738B]"
                    >
                      {materials.length === 0
                        ? 'No materials saved yet. Add a Material above to enable instant Loading Slip auto-fill.'
                        : 'No materials match your search or filter.'}
                    </td>
                  </tr>
                ) : (
                  filteredMaterials.map((mat, idx) => (
                    <tr
                      key={mat.id}
                      className={idx % 2 === 1 ? 'bg-[#F8FAFD] hover:bg-[#EFF5FC]' : 'bg-white hover:bg-[#EFF5FC]'}
                    >
                      <td className="py-2.5 px-3 text-center font-bold text-[#5B738B]">{idx + 1}</td>
                      <td className="py-2.5 px-3 font-black text-[#1C2833] text-sm">{mat.materialName}</td>
                      <td className="py-2.5 px-3 text-center">
                        <span className="inline-block px-2.5 py-0.5 rounded-lg text-[11px] font-extrabold bg-[#EAF3FD] text-[#0A6ED1] border border-[#BFD7F2]">
                          {mat.packType}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-[11px] font-black bg-amber-50 text-amber-900 border border-amber-300">
                          1 Pallet = {mat.palletRatio} {mat.packType}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-[11px] text-[#5B738B] font-semibold">
                        {mat.updatedBy || mat.createdBy || 'system'}
                      </td>
                      {canManage && (
                        <td className="py-2.5 px-3 text-center">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleStartEdit(mat)}
                              title="Edit Material"
                              className="p-1.5 rounded-lg text-[#0A6ED1] hover:bg-[#EAF3FD] border border-transparent hover:border-[#BFD7F2] transition cursor-pointer"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDelete(mat)}
                              title="Delete Material"
                              className="p-1.5 rounded-lg text-[#BB0000] hover:bg-red-50 border border-transparent hover:border-red-200 transition cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Excel Upload & Bulk Import Modal */}
      {uploadModalOpen && canManage && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-2xl border border-[#C8D6E5] shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden">
            <div className="px-5 py-3.5 bg-[#1C2833] text-white flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-2.5">
                <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
                <div>
                  <h3 className="text-sm font-black tracking-tight">Upload Material Master Excel (.xlsx / .csv)</h3>
                  <p className="text-[11px] text-slate-300">
                    Bulk add or update Material Name, Pack Type &amp; Auto-Pallet Ratio (1 Pallet =)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeUploadModal}
                disabled={importingExcel}
                className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition cursor-pointer disabled:opacity-50"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1">
              {/* Dropzone & Template Action */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragActive(true);
                }}
                onDragLeave={() => setDragActive(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragActive(false);
                  const droppedFile = e.dataTransfer?.files?.[0];
                  void handleProcessExcelFile(droppedFile);
                }}
                className={`border-2 border-dashed rounded-xl p-5 text-center transition ${
                  dragActive
                    ? 'border-[#0A6ED1] bg-[#EAF3FD]'
                    : 'border-[#BFD7F2] bg-[#F8FAFD] hover:border-[#0A6ED1]/70'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv,.tsv,.txt"
                  onChange={(e) => void handleProcessExcelFile(e.target.files?.[0])}
                  className="hidden"
                />
                <div className="flex flex-col items-center gap-2">
                  <div className="w-10 h-10 rounded-full bg-[#EAF3FD] text-[#0A6ED1] flex items-center justify-center">
                    <Upload className="w-5 h-5" />
                  </div>
                  <div className="text-xs text-[#1C2833] font-bold">
                    {parsingExcel ? 'Reading Excel file...' : 'Drag & drop your Excel (.xlsx or .csv) file here, or browse'}
                  </div>
                  <p className="text-[11px] text-[#5B738B]">
                    Expected columns: <strong>Material Name</strong>, <strong>Pack Type</strong>,{' '}
                    <strong>Auto-Pallet Ratio (1 Pallet =)</strong>, and optional <strong>Default Remarks</strong>
                  </p>
                  <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                    <button
                      type="button"
                      disabled={parsingExcel || importingExcel}
                      onClick={() => fileInputRef.current?.click()}
                      className="app-btn-sm bg-[#0A6ED1] hover:bg-[#085CAF] text-white"
                    >
                      <Upload className="w-3.5 h-3.5 shrink-0" />
                      <span>{parsedExcel ? 'Choose Another File' : 'Select Excel File'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleDownloadSampleExcel}
                      className="app-btn-sm bg-white hover:bg-[#EFF4F9] text-[#1C2833] border border-[#C8D6E5]"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5 shrink-0 text-[#107E3E]" />
                      <span>Download Sample (.xlsx)</span>
                    </button>
                  </div>
                </div>
              </div>

              {excelError && (
                <div className="bg-red-50 border border-red-300 text-red-800 px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                  <span>{excelError}</span>
                </div>
              )}

              {/* Parsed Preview */}
              {parsedExcel && (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 bg-[#F4F7FA] border border-[#DCE5EF] rounded-xl p-3">
                    <div className="text-xs text-[#1C2833]">
                      <span className="font-black">{parsedExcel.fileName}</span>
                      {parsedExcel.detectedHeaders.length > 0 && (
                        <span className="block text-[11px] text-[#5B738B] mt-0.5">
                          Detected columns: {parsedExcel.detectedHeaders.join(' | ')}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-extrabold">
                      <span className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-300">
                        {parsedExcel.validRows.length} Valid
                      </span>
                      <span className="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-800 border border-blue-300">
                        {excelSummary.newCount} New
                      </span>
                      <span className="px-2.5 py-1 rounded-lg bg-amber-50 text-amber-800 border border-amber-300">
                        {excelSummary.existingCount} Existing
                      </span>
                      {parsedExcel.invalidRows.length > 0 && (
                        <span className="px-2.5 py-1 rounded-lg bg-red-50 text-red-800 border border-red-300">
                          {parsedExcel.invalidRows.length} Invalid
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Conflict handling options */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <label
                      className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition ${
                        importMode === 'upsert'
                          ? 'bg-[#EAF3FD] border-[#0A6ED1] text-[#1C2833]'
                          : 'bg-white border-[#C8D6E5] text-[#354A5F]'
                      }`}
                    >
                      <input
                        type="radio"
                        name="excelImportMode"
                        value="upsert"
                        checked={importMode === 'upsert'}
                        onChange={() => setImportMode('upsert')}
                        className="mt-0.5"
                      />
                      <div className="text-xs">
                        <div className="font-black">Update existing &amp; add new</div>
                        <div className="text-[11px] text-[#5B738B]">
                          Existing materials will update Pack Type &amp; Auto-Pallet Ratio.
                        </div>
                      </div>
                    </label>
                    <label
                      className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition ${
                        importMode === 'skip_existing'
                          ? 'bg-[#EAF3FD] border-[#0A6ED1] text-[#1C2833]'
                          : 'bg-white border-[#C8D6E5] text-[#354A5F]'
                      }`}
                    >
                      <input
                        type="radio"
                        name="excelImportMode"
                        value="skip_existing"
                        checked={importMode === 'skip_existing'}
                        onChange={() => setImportMode('skip_existing')}
                        className="mt-0.5"
                      />
                      <div className="text-xs">
                        <div className="font-black">Add new only (skip existing)</div>
                        <div className="text-[11px] text-[#5B738B]">
                          Keeps existing Material Master records unchanged.
                        </div>
                      </div>
                    </label>
                  </div>

                  {/* Existing / Duplicate Material Warning */}
                  {excelSummary.existingCount > 0 && (
                    <div className="bg-amber-50 border border-amber-300 rounded-xl p-3 text-xs text-amber-950 flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-black">
                          Warning: {excelSummary.existingCount} material{excelSummary.existingCount === 1 ? ' is' : 's are'} already saved in Material Master.
                        </span>{' '}
                        Duplicate material names will not be created — choose <strong>Add new only</strong> to skip them, or <strong>Update existing</strong> to refresh their settings.
                      </div>
                    </div>
                  )}

                  {/* Invalid rows warning */}
                  {parsedExcel.invalidRows.length > 0 && (
                    <div className="bg-amber-50 border border-amber-300 rounded-xl p-3 text-xs text-amber-950 space-y-1">
                      <div className="font-black flex items-center gap-1.5">
                        <AlertCircle className="w-4 h-4 text-amber-700 shrink-0" />
                        <span>{parsedExcel.invalidRows.length} row(s) will be skipped due to missing/invalid data:</span>
                      </div>
                      <ul className="list-disc pl-5 text-[11px] max-h-24 overflow-y-auto space-y-0.5">
                        {parsedExcel.invalidRows.slice(0, 20).map((inv, idx) => (
                          <li key={`${inv.rowNumber}-${idx}`}>
                            Row {inv.rowNumber}: {inv.reason}
                          </li>
                        ))}
                        {parsedExcel.invalidRows.length > 20 && (
                          <li>...and {parsedExcel.invalidRows.length - 20} more skipped rows</li>
                        )}
                      </ul>
                    </div>
                  )}

                  {/* Valid rows preview table */}
                  {parsedExcel.validRows.length > 0 && (
                    <div className="border border-[#DCE5EF] rounded-xl overflow-hidden">
                      <div className="max-h-64 overflow-y-auto">
                        <table className="w-full border-collapse text-left text-xs">
                          <thead className="sticky top-0 bg-[#354A5F] text-white text-[11px] uppercase tracking-wider">
                            <tr>
                              <th className="py-2 px-3 w-16 text-center">Row</th>
                              <th className="py-2 px-3 w-24 text-center">Action</th>
                              <th className="py-2 px-3">Material Name</th>
                              <th className="py-2 px-3 w-24 text-center">Pack Type</th>
                              <th className="py-2 px-3 w-40 text-center">1 Pallet =</th>
                              <th className="py-2 px-3">Remarks</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#E3EAF2] bg-white">
                            {parsedExcel.validRows.slice(0, 200).map((row) => {
                              const exists = existingMaterialNames.has(row.materialName.trim().toUpperCase());
                              const actionLabel = !exists
                                ? 'NEW'
                                : importMode === 'upsert'
                                  ? 'UPDATE'
                                  : 'SKIP';
                              const actionClass =
                                actionLabel === 'NEW'
                                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                                  : actionLabel === 'UPDATE'
                                    ? 'bg-amber-50 text-amber-800 border-amber-300'
                                    : 'bg-slate-100 text-slate-600 border-slate-300';
                              return (
                                <tr key={`${row.rowNumber}-${row.materialName}`}>
                                  <td className="py-1.5 px-3 text-center text-[#5B738B] font-bold">{row.rowNumber}</td>
                                  <td className="py-1.5 px-3 text-center">
                                    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-black border ${actionClass}`}>
                                      {actionLabel}
                                    </span>
                                  </td>
                                  <td className="py-1.5 px-3 font-black text-[#1C2833]">{row.materialName}</td>
                                  <td className="py-1.5 px-3 text-center font-bold text-[#0A6ED1]">{row.packType}</td>
                                  <td className="py-1.5 px-3 text-center font-black text-amber-900">
                                    {row.palletRatio} {row.packType}
                                  </td>
                                  <td className="py-1.5 px-3 text-[#5B738B]">{row.remarks || '—'}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      {parsedExcel.validRows.length > 200 && (
                        <div className="px-3 py-1.5 bg-[#F8FAFD] border-t border-[#E3EAF2] text-[11px] font-semibold text-[#5B738B]">
                          Showing first 200 of {parsedExcel.validRows.length} valid rows. All {parsedExcel.validRows.length} rows will be imported.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="px-5 py-3 border-t border-[#E3EAF2] flex flex-wrap items-center justify-between gap-2 bg-[#F8FAFD] shrink-0">
              <span className="text-[11px] text-[#5B738B]">
                Max 2,000 rows per upload. Duplicate names within the file use the latest row.
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={closeUploadModal}
                  disabled={importingExcel}
                  className="app-btn-sm bg-white hover:bg-[#EFF4F9] border border-[#C8D6E5] text-[#354A5F]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!parsedExcel || parsedExcel.validRows.length === 0 || importingExcel}
                  onClick={handleConfirmExcelImport}
                  className="app-btn-sm bg-[#107E3E] hover:bg-[#0D6A34] text-white disabled:opacity-50"
                >
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>
                    {importingExcel
                      ? 'Importing...'
                      : parsedExcel
                        ? `Import ${parsedExcel.validRows.length} Material${parsedExcel.validRows.length === 1 ? '' : 's'}`
                        : 'Import Materials'}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-[#C8D6E5] shadow-2xl max-w-md w-full overflow-hidden">
            <div className="px-5 py-3.5 bg-red-50 border-b border-red-200 flex items-center gap-2 text-red-900">
              <Trash2 className="w-4 h-4 text-[#BB0000]" />
              <h3 className="text-sm font-black">Delete Material Master Record</h3>
            </div>
            <div className="p-5 text-xs text-[#354A5F] space-y-2">
              <p>
                Are you sure you want to remove{' '}
                <strong className="text-[#1C2833]">{confirmDelete.materialName}</strong> ({confirmDelete.packType}, 1 Pallet ={' '}
                {confirmDelete.palletRatio}) from Material Master?
              </p>
              <p className="text-[11px] text-[#5B738B]">
                Existing saved loading slips will not be affected, but this material will no longer appear in Loading Slip auto-fill search.
              </p>
            </div>
            <div className="px-5 py-3 border-t border-[#E3EAF2] flex justify-end gap-2 bg-[#F8FAFD]">
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                className="app-btn-sm bg-white hover:bg-[#EFF4F9] border border-[#C8D6E5] text-[#354A5F]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={handleConfirmDelete}
                className="app-btn-sm bg-[#BB0000] hover:bg-[#9E0000] text-white"
              >
                Delete Material
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
