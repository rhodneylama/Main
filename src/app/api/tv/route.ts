import { tvPayload } from "@/lib/tv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(tvPayload());
}
