import { NextRequest } from "next/server";
import { leaderboard } from "@/lib/sales-db";
import { ensureSeeded } from "@/lib/seed-demo";
import type { LeaderboardMetric, LeaderboardPeriod } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PERIODS: LeaderboardPeriod[] = ["today", "week", "month", "quarter", "all"];
const METRICS: LeaderboardMetric[] = ["points", "revenue", "deals", "activities"];

export async function GET(req: NextRequest) {
  ensureSeeded();
  const params = req.nextUrl.searchParams;

  const period = params.get("period") as LeaderboardPeriod;
  const metric = params.get("metric") as LeaderboardMetric;
  const scope = params.get("scope") === "team" ? "team" : "rep";

  return Response.json({
    entries: leaderboard(
      PERIODS.includes(period) ? period : "month",
      METRICS.includes(metric) ? metric : "points",
      scope,
    ),
  });
}
