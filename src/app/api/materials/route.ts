import { NextRequest } from "next/server";
import { createMaterial, listMaterials } from "@/lib/training-db";
import { ensureSeeded } from "@/lib/seed-demo";
import { ALLOWED_MIME_TYPES, MAX_UPLOAD_BYTES, kindForMimeType, saveUpload } from "@/lib/uploads";
import type { MaterialKind } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LINK_KINDS: MaterialKind[] = ["link", "video", "doc", "image", "pdf"];

export async function GET(req: NextRequest) {
  ensureSeeded();
  const repId = req.nextUrl.searchParams.get("repId") ?? undefined;
  return Response.json({ materials: listMaterials(repId) });
}

/**
 * Accepts both an uploaded file (multipart) and a plain link (JSON or a
 * multipart form with no file), because half of any sales team's training
 * material already lives on a Google Drive or a YouTube URL.
 */
export async function POST(req: NextRequest) {
  const contentType = req.headers.get("content-type") ?? "";

  if (!contentType.includes("multipart/form-data")) {
    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return Response.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    const title = String(body.title ?? "").trim();
    const url = String(body.url ?? "").trim();
    if (!title) return Response.json({ error: "A title is required." }, { status: 400 });
    if (!url) return Response.json({ error: "A URL is required." }, { status: 400 });

    const kind = String(body.kind ?? "link") as MaterialKind;
    return Response.json({
      material: createMaterial({
        title,
        description: String(body.description ?? ""),
        kind: LINK_KINDS.includes(kind) ? kind : "link",
        category: String(body.category ?? "General"),
        url,
        durationMin: Math.max(0, Math.round(Number(body.durationMin) || 0)),
        required: body.required === true,
        points: Math.max(0, Math.round(Number(body.points) || 15)),
      }),
    });
  }

  const form = await req.formData();
  const title = String(form.get("title") ?? "").trim();
  if (!title) return Response.json({ error: "A title is required." }, { status: 400 });

  const file = form.get("file");
  const linkUrl = String(form.get("url") ?? "").trim();

  const common = {
    title,
    description: String(form.get("description") ?? ""),
    category: String(form.get("category") ?? "General"),
    durationMin: Math.max(0, Math.round(Number(form.get("durationMin")) || 0)),
    required: form.get("required") === "true",
    points: Math.max(0, Math.round(Number(form.get("points")) || 15)),
  };

  if (!(file instanceof File) || file.size === 0) {
    if (!linkUrl) {
      return Response.json({ error: "Attach a file or provide a URL." }, { status: 400 });
    }
    const kind = String(form.get("kind") ?? "link") as MaterialKind;
    return Response.json({
      material: createMaterial({
        ...common,
        kind: LINK_KINDS.includes(kind) ? kind : "link",
        url: linkUrl,
      }),
    });
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return Response.json(
      { error: `That file is larger than the ${MAX_UPLOAD_BYTES / 1024 / 1024}MB limit.` },
      { status: 413 },
    );
  }
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return Response.json(
      { error: `Files of type "${file.type || "unknown"}" are not supported.` },
      { status: 415 },
    );
  }

  const { storedName, sizeBytes } = await saveUpload(file);

  return Response.json({
    material: createMaterial({
      ...common,
      kind: kindForMimeType(file.type),
      filePath: storedName,
      fileName: file.name,
      sizeBytes,
    }),
  });
}
