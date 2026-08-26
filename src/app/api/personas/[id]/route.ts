import { deletePersona, getPersona } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const persona = getPersona(id);
  if (!persona) return Response.json({ error: "Not found." }, { status: 404 });
  return Response.json({ persona });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const persona = getPersona(id);
  if (!persona) return Response.json({ error: "Not found." }, { status: 404 });
  if (persona.builtIn) {
    return Response.json(
      { error: "Built-in personas cannot be deleted." },
      { status: 409 },
    );
  }
  deletePersona(id);
  return Response.json({ ok: true });
}
