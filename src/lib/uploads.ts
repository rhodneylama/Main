import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { nonEmpty } from "./env";

/**
 * Uploaded training files live next to the database rather than in the public
 * folder, so they are served through an API route and never become a directory
 * anyone can list.
 */
export const UPLOAD_DIR =
  nonEmpty(process.env.SALESFLOOR_UPLOAD_DIR) ?? path.join(process.cwd(), "data", "uploads");

/** 100 MB — enough for a training video, small enough to keep the disk sane. */
export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

const EXTENSION_BY_TYPE: Record<string, string> = {
  "application/pdf": ".pdf",
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "video/mp4": ".mp4",
  "video/webm": ".webm",
  "video/quicktime": ".mov",
  "audio/mpeg": ".mp3",
  "text/plain": ".txt",
};

export const ALLOWED_MIME_TYPES = Object.keys(EXTENSION_BY_TYPE);

export function kindForMimeType(mime: string): "pdf" | "video" | "image" | "doc" {
  if (mime === "application/pdf") return "pdf";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("image/")) return "image";
  return "doc";
}

/**
 * Writes an uploaded file under a generated name. The original filename is
 * stored separately in the database — it never touches the filesystem, so a
 * crafted name cannot escape the upload directory.
 */
export async function saveUpload(file: File): Promise<{ storedName: string; sizeBytes: number }> {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const ext = EXTENSION_BY_TYPE[file.type] ?? "";
  const storedName = `${randomUUID()}${ext}`;
  const bytes = Buffer.from(await file.arrayBuffer());
  fs.writeFileSync(path.join(UPLOAD_DIR, storedName), bytes);
  return { storedName, sizeBytes: bytes.byteLength };
}

/** Resolves a stored name to a path, refusing anything that is not a bare name. */
export function uploadPath(storedName: string): string | null {
  if (!storedName || storedName !== path.basename(storedName)) return null;
  const resolved = path.join(UPLOAD_DIR, storedName);
  return resolved.startsWith(path.resolve(UPLOAD_DIR)) ? resolved : null;
}

export function deleteUpload(storedName: string): void {
  const target = uploadPath(storedName);
  if (target && fs.existsSync(target)) fs.unlinkSync(target);
}
