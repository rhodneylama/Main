import { NextRequest } from "next/server";
import { listPersonas, upsertPersona } from "@/lib/db";
import type { Persona } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ personas: listPersonas() });
}

export async function POST(req: NextRequest) {
  let body: Partial<Persona>;
  try {
    body = (await req.json()) as Partial<Persona>;
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const required = ["name", "title", "company", "industry"] as const;
  for (const field of required) {
    if (!body[field]?.toString().trim()) {
      return Response.json({ error: `Missing required field: ${field}` }, { status: 400 });
    }
  }

  const persona: Persona = {
    id: body.id?.trim() || `custom-${Date.now().toString(36)}`,
    name: body.name!.trim(),
    title: body.title!.trim(),
    company: body.company!.trim(),
    industry: body.industry!.trim(),
    difficulty: (body.difficulty ?? 3) as Persona["difficulty"],
    mood: body.mood?.trim() || "Neutral",
    personality: body.personality?.trim() || "",
    objections: body.objections?.filter((o) => o.trim()) ?? [],
    winCondition: body.winCondition?.trim() || "",
    callTypes: body.callTypes?.length ? body.callTypes : ["cold_call"],
    voiceHint: body.voiceHint,
    // Custom personas are never built-in, so they stay deletable.
    builtIn: false,
    createdAt: body.createdAt ?? new Date().toISOString(),
  };

  upsertPersona(persona);
  return Response.json({ persona });
}
