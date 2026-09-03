import { leaderboard, listReps, listTeams } from "@/lib/sales-db";
import { ensureSeeded } from "@/lib/seed-demo";
import TeamManager from "@/components/TeamManager";
import type { LeaderboardEntry } from "@/lib/types";

export const dynamic = "force-dynamic";

export default function TeamPage() {
  ensureSeeded();

  const stats: Record<string, LeaderboardEntry> = Object.fromEntries(
    leaderboard("month", "points").map((entry) => [entry.id, entry]),
  );

  return <TeamManager reps={listReps()} teams={listTeams()} stats={stats} />;
}
