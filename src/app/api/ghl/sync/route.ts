import { syncFromGhl } from "@/lib/ghl/sync";
import { publicGhlConfig } from "@/lib/ghl/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const result = await syncFromGhl();
  return Response.json(
    { result, config: publicGhlConfig() },
    { status: result.ok ? 200 : 400 },
  );
}
