import { NextRequest } from "next/server";
import { listCelebrations } from "@/lib/sales-db";
import { ensureSeeded } from "@/lib/seed-demo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  ensureSeeded();
  const limit = Number(req.nextUrl.searchParams.get("limit")) || 20;
  return Response.json({ celebrations: listCelebrations(limit) });
}
