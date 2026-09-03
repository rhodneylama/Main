import { NextRequest } from "next/server";
import { getGhlConfig, publicGhlConfig, setGhlConfig } from "@/lib/ghl/config";
import { testConnection } from "@/lib/ghl/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ config: publicGhlConfig() });
}

/**
 * Saves the GoHighLevel connection. The token is only overwritten when a new
 * one is supplied, so saving the form after editing the location id does not
 * wipe a token the browser was never shown.
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (typeof body.locationId === "string") patch.locationId = body.locationId.trim();
  if (typeof body.enabled === "boolean") patch.enabled = body.enabled;
  if (typeof body.apiToken === "string" && body.apiToken.trim()) {
    patch.apiToken = body.apiToken.trim();
  }
  if (typeof body.webhookSecret === "string") patch.webhookSecret = body.webhookSecret.trim();

  const config = setGhlConfig(patch);

  // Enabling the connection is worth a round trip — a bad token is much easier
  // to fix now than to diagnose from an empty dashboard later.
  let test: { ok: boolean; message: string } | null = null;
  if (config.enabled && config.apiToken && config.locationId) {
    test = await testConnection(config.locationId, config.apiToken);
  }

  return Response.json({ config: publicGhlConfig(getGhlConfig()), test });
}
