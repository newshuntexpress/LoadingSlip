import express, { type Request, type Response, type NextFunction } from 'express';
import crypto from 'node:crypto';
import { db, logAudit } from './db.ts';
import { upperStr } from './normalize.ts';
import {
  getClientIp,
  requireAuth,
  requireCsrf,
  requirePasswordChanged,
  requirePermission,
  requireAnyPermission,
} from './security.ts';

const STANDARD_PACK_TYPES = ['Can', 'Drum', 'Board', 'EA', 'KG', 'Rolls', 'Pallet', 'Box'];

export interface DbMaterialMasterRow {
  id: string;
  material_name: string;
  pack_type: string;
  pallet_ratio: number;
  remarks: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: number;
  updated_at: number;
}

export function normalizePackType(raw: unknown): string {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) return '';
  const standard = STANDARD_PACK_TYPES.find((p) => p.toLowerCase() === trimmed.toLowerCase());
  if (standard) return standard;
  return trimmed.toUpperCase().slice(0, 40);
}

export function normalizeMaterialMasterRow(r: DbMaterialMasterRow) {
  return {
    id: r.id,
    materialName: upperStr(r.material_name),
    packType: normalizePackType(r.pack_type) || 'Rolls',
    palletRatio: Math.max(1, Math.round(Number(r.pallet_ratio) || 23)),
    remarks: upperStr(r.remarks),
    createdBy: r.created_by || undefined,
    updatedBy: r.updated_by || undefined,
    createdAt: Number(r.created_at) || Date.now(),
    updatedAt: Number(r.updated_at) || Date.now(),
  };
}

function rejectLiquidOnlyAndForklift(req: Request, res: Response, next: NextFunction): void {
  const roleName = req.auth?.user.roleName;
  if (roleName === 'forklift_operator' || roleName === 'liquid_store_operator') {
    logAudit({
      actorUserId: req.auth?.user.id,
      actorUsername: req.auth?.user.username,
      action: 'UNAUTHORIZED_ACCESS',
      targetType: 'material_master',
      targetId: `${req.method} ${req.originalUrl}`,
      details: `Restricted operator (${roleName}) denied access to Material Master`,
      ipAddress: getClientIp(req),
    });
    res.status(403).json({
      error: 'Access denied: Your account is restricted from accessing the Material Master.',
    });
    return;
  }
  next();
}

export const materialsRouter = express.Router();

materialsRouter.use(
  requireAuth,
  requirePasswordChanged,
  rejectLiquidOnlyAndForklift
);

materialsRouter.get(
  '/',
  requireAnyPermission([
    'materials.view',
    'materials.manage',
    'tickets.view',
    'tickets.update',
    'dispatch.view',
    'material_register.view',
    'ex_factory.view',
    'ex_factory.create',
    'ex_factory.update',
  ]),
  (_req: Request, res: Response) => {
    const rows = db
      .prepare(`SELECT * FROM material_master ORDER BY material_name COLLATE NOCASE ASC`)
      .all() as DbMaterialMasterRow[];
    res.json({ materials: rows.map(normalizeMaterialMasterRow) });
  }
);

materialsRouter.post(
  '/',
  requireCsrf,
  requirePermission('materials.manage'),
  (req: Request, res: Response) => {
    const body = req.body || {};
    const materialName = upperStr(body.materialName).slice(0, 120);
    const packType = normalizePackType(body.packType);
    const ratioNum = Number(body.palletRatio);
    const remarks = upperStr(body.remarks).slice(0, 160);

    if (!materialName) {
      res.status(400).json({ error: 'Material Name is required.' });
      return;
    }
    if (!packType) {
      res.status(400).json({ error: 'Pack Type is required.' });
      return;
    }
    if (!Number.isFinite(ratioNum) || ratioNum < 1 || ratioNum > 10000) {
      res.status(400).json({ error: 'Auto-Pallet Ratio (1 Pallet =) must be a whole number between 1 and 10,000.' });
      return;
    }
    const palletRatio = Math.round(ratioNum);

    const existing = db
      .prepare(`SELECT id FROM material_master WHERE material_name = ? COLLATE NOCASE`)
      .get(materialName) as { id: string } | undefined;

    if (existing) {
      res.status(409).json({
        error: `Warning: Material "${materialName}" is already saved in Material Master. Duplicate names are not allowed.`,
      });
      return;
    }

    const now = Date.now();
    const id = `mat-${now}-${crypto.randomBytes(3).toString('hex')}`;
    const actor = req.auth!.user.username;

    db.prepare(
      `INSERT INTO material_master (id, material_name, pack_type, pallet_ratio, remarks, created_by, updated_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, materialName, packType, palletRatio, remarks, actor, actor, now, now);

    const created = db.prepare(`SELECT * FROM material_master WHERE id = ?`).get(id) as DbMaterialMasterRow;

    logAudit({
      actorUserId: req.auth!.user.id,
      actorUsername: actor,
      action: 'MATERIAL_MASTER_CREATED',
      targetType: 'material_master',
      targetId: id,
      details: `Added material ${materialName} (${packType}, 1 Pallet = ${palletRatio})`,
      ipAddress: getClientIp(req),
    });

    res.status(201).json({ material: normalizeMaterialMasterRow(created) });
  }
);

materialsRouter.put(
  '/:id',
  requireCsrf,
  requirePermission('materials.manage'),
  (req: Request, res: Response) => {
    const id = String(req.params.id || '').trim();
    const existing = db.prepare(`SELECT * FROM material_master WHERE id = ?`).get(id) as
      | DbMaterialMasterRow
      | undefined;

    if (!existing) {
      res.status(404).json({ error: 'Material Master record not found.' });
      return;
    }

    const body = req.body || {};
    const materialName = upperStr(body.materialName !== undefined ? body.materialName : existing.material_name).slice(0, 120);
    const packType = normalizePackType(body.packType !== undefined ? body.packType : existing.pack_type);
    const ratioNum = Number(body.palletRatio !== undefined ? body.palletRatio : existing.pallet_ratio);
    const remarks = upperStr(body.remarks !== undefined ? body.remarks : existing.remarks).slice(0, 160);

    if (!materialName) {
      res.status(400).json({ error: 'Material Name is required.' });
      return;
    }
    if (!packType) {
      res.status(400).json({ error: 'Pack Type is required.' });
      return;
    }
    if (!Number.isFinite(ratioNum) || ratioNum < 1 || ratioNum > 10000) {
      res.status(400).json({ error: 'Auto-Pallet Ratio (1 Pallet =) must be between 1 and 10,000.' });
      return;
    }
    const palletRatio = Math.round(ratioNum);

    const duplicate = db
      .prepare(`SELECT id FROM material_master WHERE material_name = ? COLLATE NOCASE AND id != ?`)
      .get(materialName, id) as { id: string } | undefined;

    if (duplicate) {
      res.status(409).json({
        error: `Warning: Material "${materialName}" is already saved in Material Master. Duplicate names are not allowed.`,
      });
      return;
    }

    const now = Date.now();
    const actor = req.auth!.user.username;

    db.prepare(
      `UPDATE material_master
       SET material_name = ?, pack_type = ?, pallet_ratio = ?, remarks = ?, updated_by = ?, updated_at = ?
       WHERE id = ?`
    ).run(materialName, packType, palletRatio, remarks, actor, now, id);

    const updated = db.prepare(`SELECT * FROM material_master WHERE id = ?`).get(id) as DbMaterialMasterRow;

    logAudit({
      actorUserId: req.auth!.user.id,
      actorUsername: actor,
      action: 'MATERIAL_MASTER_UPDATED',
      targetType: 'material_master',
      targetId: id,
      details: `Updated material ${materialName} (${packType}, 1 Pallet = ${palletRatio})`,
      ipAddress: getClientIp(req),
    });

    res.json({ material: normalizeMaterialMasterRow(updated) });
  }
);

materialsRouter.delete(
  '/:id',
  requireCsrf,
  requirePermission('materials.manage'),
  (req: Request, res: Response) => {
    const id = String(req.params.id || '').trim();
    const existing = db.prepare(`SELECT * FROM material_master WHERE id = ?`).get(id) as
      | DbMaterialMasterRow
      | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Material Master record not found.' });
      return;
    }

    db.prepare(`DELETE FROM material_master WHERE id = ?`).run(id);

    logAudit({
      actorUserId: req.auth!.user.id,
      actorUsername: req.auth!.user.username,
      action: 'MATERIAL_MASTER_DELETED',
      targetType: 'material_master',
      targetId: id,
      details: `Deleted material ${existing.material_name} (${existing.pack_type}, 1 Pallet = ${existing.pallet_ratio})`,
      ipAddress: getClientIp(req),
    });

    res.json({ ok: true });
  }
);

materialsRouter.post(
  '/import',
  requireCsrf,
  requirePermission('materials.manage'),
  (req: Request, res: Response) => {
    const body = req.body || {};
    const rawItems = body.items;
    const mode: 'upsert' | 'skip_existing' = body.mode === 'skip_existing' ? 'skip_existing' : 'upsert';

    if (!Array.isArray(rawItems) || rawItems.length === 0) {
      res.status(400).json({ error: 'No material rows provided for import.' });
      return;
    }
    if (rawItems.length > 2000) {
      res.status(400).json({ error: 'Maximum 2,000 rows can be imported in a single upload.' });
      return;
    }

    const actor = req.auth!.user.username;
    const now = Date.now();
    let insertedCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    const errors: string[] = [];

    // Deduplicate incoming rows by material name (latest wins) after validating
    const validatedMap = new Map<
      string,
      { materialName: string; packType: string; palletRatio: number; remarks: string }
    >();

    rawItems.forEach((raw: any, idx: number) => {
      const materialName = upperStr(raw?.materialName).slice(0, 120);
      const packType = normalizePackType(raw?.packType) || 'Rolls';
      const ratioNum = Number(raw?.palletRatio);
      const remarks = upperStr(raw?.remarks).slice(0, 160);

      if (!materialName) {
        errors.push(`Row ${idx + 1}: Missing Material Name.`);
        skippedCount += 1;
        return;
      }
      if (!Number.isFinite(ratioNum) || ratioNum < 1 || ratioNum > 10000) {
        errors.push(`Row ${idx + 1} (${materialName}): Invalid Auto-Pallet Ratio.`);
        skippedCount += 1;
        return;
      }
      validatedMap.set(materialName.toUpperCase(), {
        materialName,
        packType,
        palletRatio: Math.round(ratioNum),
        remarks,
      });
    });

    if (validatedMap.size === 0) {
      res.status(400).json({
        error: errors[0] || 'No valid material rows found in the uploaded file.',
      });
      return;
    }

    const selectExisting = db.prepare(
      `SELECT id FROM material_master WHERE material_name = ? COLLATE NOCASE`
    );
    const insertStmt = db.prepare(
      `INSERT INTO material_master (id, material_name, pack_type, pallet_ratio, remarks, created_by, updated_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const updateStmt = db.prepare(
      `UPDATE material_master
       SET material_name = ?, pack_type = ?, pallet_ratio = ?, remarks = ?, updated_by = ?, updated_at = ?
       WHERE id = ?`
    );

    db.transaction(() => {
      for (const item of validatedMap.values()) {
        const existing = selectExisting.get(item.materialName) as { id: string } | undefined;
        if (existing) {
          if (mode === 'skip_existing') {
            skippedCount += 1;
          } else {
            updateStmt.run(
              item.materialName,
              item.packType,
              item.palletRatio,
              item.remarks,
              actor,
              now,
              existing.id
            );
            updatedCount += 1;
          }
        } else {
          const id = `mat-${now}-${crypto.randomBytes(3).toString('hex')}`;
          insertStmt.run(
            id,
            item.materialName,
            item.packType,
            item.palletRatio,
            item.remarks,
            actor,
            actor,
            now,
            now
          );
          insertedCount += 1;
        }
      }
    })();

    const allRows = db
      .prepare(`SELECT * FROM material_master ORDER BY material_name COLLATE NOCASE ASC`)
      .all() as DbMaterialMasterRow[];

    logAudit({
      actorUserId: req.auth!.user.id,
      actorUsername: actor,
      action: 'MATERIAL_MASTER_EXCEL_IMPORT',
      targetType: 'material_master',
      details: `Excel import (${mode}): ${insertedCount} added, ${updatedCount} updated, ${skippedCount} skipped`,
      ipAddress: getClientIp(req),
    });

    res.json({
      insertedCount,
      updatedCount,
      skippedCount,
      errors: errors.slice(0, 20),
      materials: allRows.map(normalizeMaterialMasterRow),
    });
  }
);

export function syncMissingMaterialsFromLoadingSlip(
  items: Array<{
    description?: unknown;
    pack?: unknown;
    palletRatio?: unknown;
    remarks?: unknown;
  }> | undefined,
  actorUsername: string,
  actorUserId?: string,
  ipAddress?: string
): { addedMaterials: ReturnType<typeof normalizeMaterialMasterRow>[] } {
  if (!Array.isArray(items) || items.length === 0) {
    return { addedMaterials: [] };
  }

  const selectExisting = db.prepare(
    `SELECT id FROM material_master WHERE material_name = ? COLLATE NOCASE`
  );
  const insertStmt = db.prepare(
    `INSERT OR IGNORE INTO material_master (id, material_name, pack_type, pallet_ratio, remarks, created_by, updated_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const selectById = db.prepare(`SELECT * FROM material_master WHERE id = ?`);

  const seenNames = new Set<string>();
  const addedMaterials: ReturnType<typeof normalizeMaterialMasterRow>[] = [];
  const now = Date.now();
  const actor = String(actorUsername || 'system').trim() || 'system';

  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const materialName = upperStr(item.description).slice(0, 120);
    if (!materialName) continue;

    // Prevent saving duplicate names within the same loading slip
    if (seenNames.has(materialName)) continue;
    seenNames.add(materialName);

    // Never duplicate an already saved material in Material Master
    const existing = selectExisting.get(materialName) as { id: string } | undefined;
    if (existing) continue;

    const packType = normalizePackType(item.pack) || 'Rolls';
    const rawRatio = Number(item.palletRatio);
    const palletRatio =
      Number.isFinite(rawRatio) && rawRatio >= 1 && rawRatio <= 10000 ? Math.round(rawRatio) : 23;
    const remarks = upperStr(item.remarks).slice(0, 160);
    const id = `mat-${now}-${crypto.randomBytes(3).toString('hex')}`;

    const info = insertStmt.run(id, materialName, packType, palletRatio, remarks, actor, actor, now, now);
    if (info.changes > 0) {
      const createdRow = selectById.get(id) as DbMaterialMasterRow | undefined;
      if (createdRow) {
        addedMaterials.push(normalizeMaterialMasterRow(createdRow));
      }
    }
  }

  if (addedMaterials.length > 0) {
    logAudit({
      actorUserId,
      actorUsername: actor,
      action: 'MATERIAL_MASTER_AUTO_CREATED',
      targetType: 'material_master',
      details: `Auto-saved ${addedMaterials.length} new material(s) from Loading Slip: ${addedMaterials
        .map((m) => `${m.materialName} (${m.packType}, 1 Pallet = ${m.palletRatio})`)
        .join(', ')}`,
      ipAddress,
    });
  }

  return { addedMaterials };
}
