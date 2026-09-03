import { NextRequest } from "next/server";
import { getGhlConfig } from "@/lib/ghl/config";
import { handleGhlWebhook } from "@/lib/ghl/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Inbound GoHighLevel webhooks. Point a workflow's webhook action here and
 * opportunity, appointment and message events land on the board as they happen,
 * without waiting for the next sync.
 *
 * When a webhook secret is configured it must arrive as `x-webhook-secret`;
 * anything else is rejected. With no secret set the endpoint is open, which is
 * only appropriate behind a private network.
 */
export async function POST(req: NextRequest) {
  const { webhookSecret } = getGhlConfig();
  if (webhookSecret) {
    const provided =
      req.headers.get("x-webhook-secret") ?? req.nextUrl.searchParams.get("secret") ?? "";
    if (provided !== webhookSecret) {
      return Response.json({ error: "Invalid webhook secret." }, { status: 401 });
    }
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const outcome = handleGhlWebhook(payload);

  // Always 200: a webhook GoHighLevel cannot deliver gets retried forever, and
  // an event we have no mapping for is not an error on their side.
  return Response.json({ ok: true, ...outcome });
}
