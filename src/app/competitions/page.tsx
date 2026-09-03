import { competitionStandings, competitionStatus, listCompetitions } from "@/lib/sales-db";
import { ensureSeeded } from "@/lib/seed-demo";
import CompetitionManager, { type CompetitionView } from "@/components/CompetitionManager";

export const dynamic = "force-dynamic";

export default function CompetitionsPage() {
  ensureSeeded();

  const competitions: CompetitionView[] = listCompetitions().map((c) => ({
    ...c,
    status: competitionStatus(c),
    standings: competitionStandings(c),
  }));

  return <CompetitionManager competitions={competitions} />;
}
