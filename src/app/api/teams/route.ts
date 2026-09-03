import { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { listTeams, upsertTeam } from "@/lib/sales-db";
import { ensureSeeded } from "@/lib/seed-demo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  ensureSeeded();
  return Response.json({ teams: listTeams() });
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const name = String(body.name ?? "").trim();
  if (!name) return Response.json({ error: "A team name is required." }, { status: 400 });

  const slot = Number(body.colorSlot);
  const team = upsertTeam({
    id: typeof body.id === "string" && body.id ? body.id : randomUUID(),
    name,
    colorSlot: slot >= 1 && slot <= 5 ? slot : 1,
  });

  return Response.json({ team });
}
