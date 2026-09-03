import { deactivateRep, getRep } from "@/lib/sales-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rep = getRep(id);
  if (!rep) return Response.json({ error: "Not found." }, { status: 404 });
  return Response.json({ rep });
}

/** Deactivates rather than deletes, so past leaderboards still add up. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!deactivateRep(id)) return Response.json({ error: "Not found." }, { status: 404 });
  return Response.json({ ok: true });
}
