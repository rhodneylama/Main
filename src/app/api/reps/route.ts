import { NextRequest } from "next/server";
import { listReps, upsertRep } from "@/lib/sales-db";
import { ensureSeeded } from "@/lib/seed-demo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  ensureSeeded();
  const includeInactive = req.nextUrl.searchParams.get("all") === "1";
  return Response.json({ reps: listReps(includeInactive) });
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const name = String(body.name ?? "").trim();
  if (!name) return Response.json({ error: "A name is required." }, { status: 400 });

  const rep = upsertRep({
    id: typeof body.id === "string" ? body.id : undefined,
    name,
    email: typeof body.email === "string" ? body.email : undefined,
    teamId: typeof body.teamId === "string" ? body.teamId : null,
    avatar: typeof body.avatar === "string" && body.avatar ? body.avatar : undefined,
    role: body.role === "manager" || body.role === "admin" ? body.role : "rep",
    quotaCents: Number.isFinite(Number(body.quotaCents)) ? Number(body.quotaCents) : undefined,
    active: typeof body.active === "boolean" ? body.active : undefined,
  });

  return Response.json({ rep });
}
