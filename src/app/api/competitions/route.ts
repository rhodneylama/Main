import { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import {
  competitionStandings,
  competitionStatus,
  listCompetitions,
  upsertCompetition,
} from "@/lib/sales-db";
import { ensureSeeded } from "@/lib/seed-demo";
import type { Competition, CompetitionMetric, CompetitionScope } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const METRICS: CompetitionMetric[] = ["points", "revenue", "deals", "activities"];

export async function GET() {
  ensureSeeded();
  const competitions = listCompetitions().map((c) => ({
    ...c,
    status: competitionStatus(c),
    standings: competitionStandings(c).slice(0, 10),
  }));
  return Response.json({ competitions });
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const name = String(body.name ?? "").trim();
  const startsAt = String(body.startsAt ?? "");
  const endsAt = String(body.endsAt ?? "");

  if (!name) return Response.json({ error: "A name is required." }, { status: 400 });
  if (!startsAt || !endsAt) {
    return Response.json({ error: "Start and end dates are required." }, { status: 400 });
  }
  if (endsAt <= startsAt) {
    return Response.json({ error: "The end date must be after the start date." }, { status: 400 });
  }

  const metric = String(body.metric ?? "points") as CompetitionMetric;
  const scope: CompetitionScope = body.scope === "team" ? "team" : "rep";

  const competition: Competition = {
    id: typeof body.id === "string" && body.id ? body.id : randomUUID(),
    name,
    description: String(body.description ?? ""),
    metric: METRICS.includes(metric) ? metric : "points",
    scope,
    startsAt,
    endsAt,
    target: Math.max(0, Math.round(Number(body.target) || 0)),
    prize: String(body.prize ?? ""),
    createdAt: new Date().toISOString(),
  };

  upsertCompetition(competition);
  return Response.json({ competition });
}
