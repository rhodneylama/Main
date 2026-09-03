import fs from "node:fs";
import { getMaterial } from "@/lib/training-db";
import { uploadPath } from "@/lib/uploads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CONTENT_TYPES: Record<string, string> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".mp3": "audio/mpeg",
  ".txt": "text/plain",
};

/** Streams an uploaded training file back to the browser. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const material = getMaterial(id);
  if (!material?.filePath) return new Response("Not found", { status: 404 });

  const target = uploadPath(material.filePath);
  if (!target || !fs.existsSync(target)) return new Response("Not found", { status: 404 });

  const ext = material.filePath.slice(material.filePath.lastIndexOf("."));
  const body = fs.readFileSync(target);

  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": CONTENT_TYPES[ext] ?? "application/octet-stream",
      "Content-Length": String(body.byteLength),
      // inline so PDFs and videos open in the page rather than downloading.
      "Content-Disposition": `inline; filename="${encodeURIComponent(material.fileName ?? "file")}"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
