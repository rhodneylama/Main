import { deleteTeam } from "@/lib/sales-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!deleteTeam(id)) return Response.json({ error: "Not found." }, { status: 404 });
  return Response.json({ ok: true });
}
