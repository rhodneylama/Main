import { NextRequest } from "next/server";
import { completeMaterial, uncompleteMaterial } from "@/lib/training-db";
import { ensureRepByName, getRep } from "@/lib/sales-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function resolveRepId(req: NextRequest): Promise<string | null> {
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    /* an empty body is fine; fall through to the query string */
  }

  const repId = String(body.repId ?? req.nextUrl.searchParams.get("repId") ?? "");
  if (repId) return getRep(repId) ? repId : null;

  const repName = String(body.repName ?? req.nextUrl.searchParams.get("repName") ?? "").trim();
  return repName ? ensureRepByName(repName).id : null;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const repId = await resolveRepId(req);
  if (!repId) return Response.json({ error: "Unknown rep." }, { status: 400 });

  const completed = completeMaterial(id, repId);
  return Response.json({ ok: true, completed, alreadyComplete: !completed });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const repId = await resolveRepId(req);
  if (!repId) return Response.json({ error: "Unknown rep." }, { status: 400 });

  uncompleteMaterial(id, repId);
  return Response.json({ ok: true });
}
