import { getSetting, setSetting } from "../db";
import { nonEmpty } from "../env";
import type { GhlConfig } from "../types";

const KEY = "ghl_config";

const EMPTY: GhlConfig = {
  apiToken: "",
  locationId: "",
  webhookSecret: "",
  enabled: false,
  lastSyncAt: null,
  lastSyncStatus: null,
};

/**
 * Config comes from the database first so it can be edited in Settings, with
 * environment variables as the fallback for deployments that would rather not
 * keep a token in the app's own database.
 */
export function getGhlConfig(): GhlConfig {
  const stored = getSetting<Partial<GhlConfig>>(KEY, {});
  return {
    ...EMPTY,
    ...stored,
    apiToken: stored.apiToken || nonEmpty(process.env.GHL_API_TOKEN) || "",
    locationId: stored.locationId || nonEmpty(process.env.GHL_LOCATION_ID) || "",
    webhookSecret: stored.webhookSecret || nonEmpty(process.env.GHL_WEBHOOK_SECRET) || "",
  };
}

export function setGhlConfig(patch: Partial<GhlConfig>): GhlConfig {
  const next = { ...getGhlConfig(), ...patch };
  setSetting(KEY, next);
  return next;
}

export function isGhlConfigured(config = getGhlConfig()): boolean {
  return Boolean(config.enabled && config.apiToken && config.locationId);
}

/** Never send a token to the browser — the settings form shows this instead. */
export function maskToken(token: string): string {
  if (!token) return "";
  if (token.length <= 8) return "••••";
  return `${token.slice(0, 4)}••••${token.slice(-4)}`;
}

/** The shape the settings page receives: everything except the secrets. */
export function publicGhlConfig(config = getGhlConfig()) {
  return {
    locationId: config.locationId,
    enabled: config.enabled,
    lastSyncAt: config.lastSyncAt,
    lastSyncStatus: config.lastSyncStatus,
    tokenMask: maskToken(config.apiToken),
    hasToken: Boolean(config.apiToken),
    hasWebhookSecret: Boolean(config.webhookSecret),
  };
}
