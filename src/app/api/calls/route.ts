import { NextRequest } from "next/server";
import { listCalls, saveCall } from "@/lib/db";
import type { CallRecord } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const rep = req.nextUrl.searchParams.get("rep") ?? undefined;
  return Response.json({ calls: listCalls(rep) });
}

export async function POST(req: NextRequest) {
  let call: CallRecord;
  try {
    call = (await req.json()) as CallRecord;
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!call.id || !call.repName?.trim() || !call.personaId) {
    return Response.json(
      { error: "id, repName and personaId are required." },
      { status: 400 },
    );
  }

  saveCall({ ...call, repName: call.repName.trim(), scorecard: call.scorecard ?? null });
  return Response.json({ ok: true, id: call.id });
}
