import { NextRequest } from "next/server";
import { getProductContext, setProductContext } from "@/lib/db";
import type { ProductContext } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ productContext: getProductContext() });
}

export async function POST(req: NextRequest) {
  let body: ProductContext;
  try {
    body = (await req.json()) as ProductContext;
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  setProductContext({
    product: body.product ?? "",
    icp: body.icp ?? "",
    pitch: body.pitch ?? "",
    proofPoints: body.proofPoints ?? "",
    commonObjections: body.commonObjections ?? "",
  });

  return Response.json({ ok: true });
}
