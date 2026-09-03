import { NextRequest } from "next/server";
import { dashboard } from "@/lib/analytics";
import { ensureSeeded } from "@/lib/seed-demo";
import type { LeaderboardPeriod } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  ensureSeeded();
  const period = (req.nextUrl.searchParams.get("period") ?? "month") as LeaderboardPeriod;
  return Response.json({ dashboard: dashboard(period) });
}
