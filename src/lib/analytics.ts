import { listReps, leaderboard, listCelebrations, periodSummary, stageBreakdown, trend } from "./sales-db";
import type { DashboardData, LeaderboardPeriod } from "./types";

/**
 * Everything the floor dashboard shows, assembled in one place so the page and
 * the TV screen read from exactly the same numbers.
 */
export function dashboard(period: LeaderboardPeriod = "month"): DashboardData {
  const summary = periodSummary(period);
  const quotaCents = listReps().reduce((sum, rep) => sum + rep.quotaCents, 0);
  const closed = summary.wonDeals + summary.lostDeals;

  return {
    wonRevenueCents: summary.wonRevenueCents,
    wonDeals: summary.wonDeals,
    openPipelineCents: summary.openPipelineCents,
    openDeals: summary.openDeals,
    activitiesToday: summary.activitiesToday,
    appointmentsSet: summary.appointmentsSet,
    quotaCents,
    quotaAttainment: quotaCents > 0 ? summary.wonRevenueCents / quotaCents : 0,
    avgDealCents: summary.wonDeals > 0 ? Math.round(summary.wonRevenueCents / summary.wonDeals) : 0,
    winRate: closed > 0 ? summary.wonDeals / closed : 0,
    stages: stageBreakdown(),
    trend: trend(30),
    topReps: leaderboard(period, "points").slice(0, 5),
    celebrations: listCelebrations(8),
  };
}
