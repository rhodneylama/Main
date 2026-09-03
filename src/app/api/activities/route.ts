import { NextRequest } from "next/server";
import { getRep, listActivities, recordActivity, recordCelebration, syncBadges } from "@/lib/sales-db";
import { ensureSeeded } from "@/lib/seed-demo";
import { DEFAULT_POINT_RULES } from "@/lib/points";
import type { ActivityType } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_TYPES = Object.keys(DEFAULT_POINT_RULES) as ActivityType[];

export async function GET(req: NextRequest) {
  ensureSeeded();
  const params = req.nextUrl.searchParams;
  return Response.json({
    activities: listActivities({
      repId: params.get("repId") ?? undefined,
      since: params.get("since") ?? undefined,
      limit: Number(params.get("limit")) || 50,
    }),
  });
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const repId = String(body.repId ?? "");
  const type = String(body.type ?? "") as ActivityType;

  if (!VALID_TYPES.includes(type)) {
    return Response.json({ error: `Unknown activity type "${type}".` }, { status: 400 });
  }

  const rep = getRep(repId);
  if (!rep) return Response.json({ error: "Unknown rep." }, { status: 400 });

  const valueCents = Math.max(0, Math.round(Number(body.valueCents) || 0));
  const count = Math.min(100, Math.max(1, Math.round(Number(body.count) || 1)));

  // Reps log a morning's dials in one go, so a count is allowed — capped so a
  // stray keypress can't dump a thousand rows on the board.
  const created = [];
  for (let i = 0; i < count; i++) {
    const activity = recordActivity({
      repId,
      type,
      subject: String(body.subject ?? "").slice(0, 200),
      valueCents,
      source: "manual",
    });
    if (activity) created.push(activity);
  }

  if (type === "deal_won" && valueCents > 0) {
    recordCelebration({
      repId,
      kind: "deal_won",
      headline: `${rep.name} closed a deal`,
      detail: String(body.subject ?? ""),
      valueCents,
    });
  }

  syncBadges(repId);
  return Response.json({ ok: true, created: created.length, activities: created });
}
