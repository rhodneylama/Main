import { randomUUID } from "node:crypto";
import { connect } from "./db";
import { recordActivity, syncBadges } from "./sales-db";
import type { Material, MaterialProgress, MaterialWithProgress } from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */

function rowToMaterial(row: any): Material {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    kind: row.kind,
    category: row.category,
    url: row.url ?? null,
    filePath: row.file_path ?? null,
    fileName: row.file_name ?? null,
    sizeBytes: row.size_bytes,
    durationMin: row.duration_min,
    required: Boolean(row.required),
    points: row.points,
    createdAt: row.created_at,
  };
}

export function listMaterials(repId?: string): MaterialWithProgress[] {
  const handle = connect();
  const rows = handle
    .prepare(
      `SELECT m.*,
              (SELECT COUNT(*) FROM material_progress p WHERE p.material_id = m.id) AS completed_by,
              (SELECT COUNT(*) FROM material_progress p
                WHERE p.material_id = m.id AND p.rep_id = ?) AS mine
         FROM materials m
        ORDER BY m.required DESC, m.category, m.created_at DESC`,
    )
    .all(repId ?? "") as any[];

  return rows.map((row) => ({
    ...rowToMaterial(row),
    completedBy: row.completed_by ?? 0,
    completedByMe: (row.mine ?? 0) > 0,
  }));
}

export function getMaterial(id: string): Material | null {
  const row = connect().prepare("SELECT * FROM materials WHERE id = ?").get(id);
  return row ? rowToMaterial(row) : null;
}

export function createMaterial(input: Partial<Material> & { title: string; kind: Material["kind"] }): Material {
  const material: Material = {
    id: input.id ?? randomUUID(),
    title: input.title,
    description: input.description ?? "",
    kind: input.kind,
    category: input.category?.trim() || "General",
    url: input.url ?? null,
    filePath: input.filePath ?? null,
    fileName: input.fileName ?? null,
    sizeBytes: input.sizeBytes ?? 0,
    durationMin: input.durationMin ?? 0,
    required: input.required ?? false,
    points: input.points ?? 15,
    createdAt: input.createdAt ?? new Date().toISOString(),
  };

  connect()
    .prepare(
      `INSERT INTO materials
         (id, title, description, kind, category, url, file_path, file_name,
          size_bytes, duration_min, required, points, created_at)
       VALUES
         (@id, @title, @description, @kind, @category, @url, @filePath, @fileName,
          @sizeBytes, @durationMin, @required, @points, @createdAt)
       ON CONFLICT(id) DO UPDATE SET
         title = excluded.title, description = excluded.description,
         category = excluded.category, url = excluded.url, required = excluded.required,
         points = excluded.points, duration_min = excluded.duration_min`,
    )
    .run({ ...material, required: material.required ? 1 : 0 });

  return material;
}

export function deleteMaterial(id: string): boolean {
  const handle = connect();
  const remove = handle.transaction(() => {
    handle.prepare("DELETE FROM material_progress WHERE material_id = ?").run(id);
    return handle.prepare("DELETE FROM materials WHERE id = ?").run(id).changes > 0;
  });
  return remove();
}

export function listProgress(repId: string): MaterialProgress[] {
  return (
    connect()
      .prepare("SELECT * FROM material_progress WHERE rep_id = ?")
      .all(repId) as any[]
  ).map((row) => ({
    materialId: row.material_id,
    repId: row.rep_id,
    completedAt: row.completed_at,
  }));
}

/**
 * Marks a material complete for a rep and pays out its points. Completing the
 * same material twice is a no-op, so points can't be farmed by re-opening it.
 */
export function completeMaterial(materialId: string, repId: string): boolean {
  const material = getMaterial(materialId);
  if (!material) return false;

  const res = connect()
    .prepare(
      `INSERT OR IGNORE INTO material_progress (material_id, rep_id, completed_at)
       VALUES (?, ?, ?)`,
    )
    .run(materialId, repId, new Date().toISOString());

  if (res.changes === 0) return false;

  recordActivity({
    repId,
    type: "material_completed",
    subject: material.title,
    points: material.points,
    source: "manual",
  });
  syncBadges(repId);
  return true;
}

export function uncompleteMaterial(materialId: string, repId: string): boolean {
  return (
    connect()
      .prepare("DELETE FROM material_progress WHERE material_id = ? AND rep_id = ?")
      .run(materialId, repId).changes > 0
  );
}
