import { dashboard } from "./analytics";
import { competitionStandings, competitionStatus, leaderboard, listCompetitions } from "./sales-db";
import { ensureSeeded } from "./seed-demo";
import type {
  Competition,
  CompetitionStanding,
  DashboardData,
  LeaderboardEntry,
} from "./types";

export interface TvPayload {
  dashboard: DashboardData;
  repBoard: LeaderboardEntry[];
  teamBoard: LeaderboardEntry[];
  competition: (Competition & { standings: CompetitionStanding[] }) | null;
}

/** Everything the wall display needs, in one round trip. */
export function tvPayload(): TvPayload {
  ensureSeeded();

  const live = listCompetitions().find((c) => competitionStatus(c) === "live") ?? null;

  return {
    dashboard: dashboard("month"),
    repBoard: leaderboard("month", "points"),
    teamBoard: leaderboard("month", "points", "team"),
    competition: live ? { ...live, standings: competitionStandings(live) } : null,
  };
}
