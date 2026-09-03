import {
  competitionStandings,
  competitionStatus,
  deleteCompetition,
  getCompetition,
} from "@/lib/sales-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const competition = getCompetition(id);
  if (!competition) return Response.json({ error: "Not found." }, { status: 404 });
  return Response.json({
    competition: {
      ...competition,
      status: competitionStatus(competition),
      standings: competitionStandings(competition),
    },
  });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!deleteCompetition(id)) return Response.json({ error: "Not found." }, { status: 404 });
  return Response.json({ ok: true });
}
