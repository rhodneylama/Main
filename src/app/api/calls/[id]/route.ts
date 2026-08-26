import { getCall } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const call = getCall(id);
  if (!call) return Response.json({ error: "Not found." }, { status: 404 });
  return Response.json({ call });
}
