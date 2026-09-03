"use client";

import { useState } from "react";
import { relativeTime } from "@/lib/format";
import type { GhlSyncResult } from "@/lib/types";

export interface PublicGhlConfig {
  locationId: string;
  enabled: boolean;
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
  tokenMask: string;
  hasToken: boolean;
  hasWebhookSecret: boolean;
}

/**
 * The GoHighLevel connection. The token is write-only from here — the server
 * only ever sends back a mask, so saving the form after editing the location id
 * cannot wipe a token nobody re-typed.
 */
export default function GhlSettings({
  config: initial,
  webhookUrl,
}: {
  config: PublicGhlConfig;
  webhookUrl: string;
}) {
  const [config, setConfig] = useState(initial);
  const [token, setToken] = useState("");
  const [secret, setSecret] = useState("");
  const [locationId, setLocationId] = useState(initial.locationId);
  const [enabled, setEnabled] = useState(initial.enabled);
  const [status, setStatus] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [saving, setSaving] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setStatus(null);
    try {
      const res = await fetch("/api/ghl/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locationId,
          enabled,
          ...(token ? { apiToken: token } : {}),
          ...(secret ? { webhookSecret: secret } : {}),
        }),
      });
      const data = (await res.json()) as {
        config: PublicGhlConfig;
        test: { ok: boolean; message: string } | null;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Could not save.");

      setConfig(data.config);
      setToken("");
      setSecret("");
      setStatus(data.test ? data.test.message : "Saved.");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  async function sync() {
    setSyncing(true);
    setStatus(null);
    try {
      const res = await fetch("/api/ghl/sync", { method: "POST" });
      const data = (await res.json()) as { result: GhlSyncResult; config: PublicGhlConfig };
      setConfig(data.config);
      setStatus(data.result.message);
    } catch {
      setStatus("The sync could not be started.");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="panel space-y-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-white">GoHighLevel</h2>
          <p className="mt-0.5 text-sm text-muted">
            Pulls pipelines, users and opportunities in. Won and lost opportunities become
            leaderboard activity automatically.
          </p>
        </div>
        <span
          className={`chip ${
            config.enabled && config.hasToken
              ? "border-status-good/40 text-status-good"
              : "border-edge text-muted"
          }`}
        >
          {config.enabled && config.hasToken ? "Connected" : "Not connected"}
        </span>
      </div>

      <form onSubmit={save} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="ghl-location">
              Location ID
            </label>
            <input
              id="ghl-location"
              className="field"
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
              placeholder="ve9EPM428h8vShlRW1KT"
            />
          </div>
          <div>
            <label className="label" htmlFor="ghl-token">
              Private integration token
            </label>
            <input
              id="ghl-token"
              type="password"
              className="field"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder={config.hasToken ? config.tokenMask : "pit-…"}
              autoComplete="off"
            />
            <p className="mt-1 text-xs text-muted">
              {config.hasToken
                ? "A token is stored. Leave this blank to keep it."
                : "Settings → Private Integrations in GoHighLevel."}
            </p>
          </div>
        </div>

        <div>
          <label className="label" htmlFor="ghl-secret">
            Webhook secret <span className="normal-case text-muted">(optional)</span>
          </label>
          <input
            id="ghl-secret"
            type="password"
            className="field"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder={config.hasWebhookSecret ? "••••••••" : "A shared secret of your choosing"}
            autoComplete="off"
          />
          <p className="mt-1 text-xs text-muted">
            When set, inbound webhooks must send it as <code>x-webhook-secret</code>.
          </p>
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          Use GoHighLevel as the source for deals and pipelines
        </label>

        <div className="flex flex-wrap items-center gap-2">
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? "Saving…" : "Save connection"}
          </button>
          <button
            type="button"
            className="btn-ghost"
            onClick={sync}
            disabled={syncing || !config.enabled || !config.hasToken}
          >
            {syncing ? "Syncing…" : "Sync now"}
          </button>
          {config.lastSyncAt && (
            <span className="text-xs text-muted">
              Last sync {relativeTime(config.lastSyncAt)}
              {config.lastSyncStatus && ` — ${config.lastSyncStatus}`}
            </span>
          )}
        </div>

        {status && <p className="text-sm text-slate-300">{status}</p>}
      </form>

      <div className="rounded-lg border border-edge bg-ink/60 p-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
          Live updates
        </h3>
        <p className="mt-1.5 text-sm text-muted">
          For wins to hit the board the moment they land, add a webhook action to your GoHighLevel
          workflows pointing at:
        </p>
        <code className="mt-2 block overflow-x-auto rounded bg-ink px-2.5 py-1.5 text-xs text-accent">
          {webhookUrl}
        </code>
        <p className="mt-2 text-xs text-muted">
          Opportunity status changes, appointments and call/SMS/email events are all understood.
          Anything else is acknowledged and ignored.
        </p>
      </div>
    </div>
  );
}
