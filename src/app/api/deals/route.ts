import { NextRequest } from "next/server";
import { listDeals, stageBreakdown } from "@/lib/sales-db";
import { ensureSeeded } from "@/lib/seed-demo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  ensureSeeded();
  const params = req.nextUrl.searchParams;
  return Response.json({
    deals: listDeals({
      repId: params.get("repId") ?? undefined,
      status: params.get("status") ?? undefined,
      limit: Number(params.get("limit")) || 100,
    }),
    stages: stageBreakdown(),
  });
}
