"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ACTIVITY_LABELS, DEFAULT_POINT_RULES, MANUAL_ACTIVITY_TYPES } from "@/lib/points";
import { useRepIdentity } from "@/lib/use-rep";
import type { ActivityType } from "@/lib/types";

/**
 * Quick logging for the activity GoHighLevel doesn't see — the dials made from
 * a mobile, the proposal sent from a personal inbox. Synced activity arrives on
 * its own and doesn't need a form.
 */
export default function ActivityLogger() {
  const router = useRouter();
  const { rep, loaded } = useRepIdentity();
  const [type, setType] = useState<ActivityType>("call");
  const [subject, setSubject] = useState("");
  const [count, setCount] = useState(1);
  const [value, setValue] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const needsValue = type === "deal_won";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!rep) return;

    setSaving(true);
    setStatus(null);
    try {
      const res = await fetch("/api/activities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repId: rep.id,
          type,
          subject,
          count,
          valueCents: needsValue ? Math.round(Number(value) * 100) || 0 : 0,
        }),
      });
      const data = (await res.json()) as { created?: number; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not log that.");

      setStatus(`Logged ${data.created} × ${ACTIVITY_LABELS[type]}.`);
      setSubject("");
      setCount(1);
      setValue("");
      router.refresh();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Could not log that.");
    } finally {
      setSaving(false);
    }
  }

  if (!loaded) return null;

  if (!rep) {
    return (
      <div className="panel p-4">
        <h2 className="text-sm font-semibold text-white">Log activity</h2>
        <p className="mt-2 text-sm text-muted">
          Pick your name in the header first — points need somewhere to go.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="panel p-4">
      <h2 className="text-sm font-semibold text-white">Log activity</h2>
      <p className="mt-0.5 text-xs text-muted">Logging as {rep.name}</p>

      <div className="mt-3 space-y-3">
        <div>
          <label className="label" htmlFor="activity-type">
            What did you do
          </label>
          <select
            id="activity-type"
            className="field"
            value={type}
            onChange={(e) => setType(e.target.value as ActivityType)}
          >
            {MANUAL_ACTIVITY_TYPES.map((t) => (
              <option key={t} value={t}>
                {ACTIVITY_LABELS[t]} · {DEFAULT_POINT_RULES[t]} pts
              </option>
            ))}
            <option value="deal_won">{ACTIVITY_LABELS.deal_won} · scales with value</option>
          </select>
        </div>

        <div>
          <label className="label" htmlFor="activity-subject">
            Who with <span className="normal-case text-muted">(optional)</span>
          </label>
          <input
            id="activity-subject"
            className="field"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Northwind Logistics"
          />
        </div>

        <div className="flex gap-3">
          {!needsValue && (
            <div className="w-28">
              <label className="label" htmlFor="activity-count">
                How many
              </label>
              <input
                id="activity-count"
                type="number"
                min={1}
                max={100}
                className="field"
                value={count}
                onChange={(e) => setCount(Number(e.target.value))}
              />
            </div>
          )}
          {needsValue && (
            <div className="flex-1">
              <label className="label" htmlFor="activity-value">
                Deal value
              </label>
              <input
                id="activity-value"
                type="number"
                min={0}
                step="0.01"
                className="field"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="7500"
              />
            </div>
          )}
        </div>

        <button type="submit" className="btn-primary w-full" disabled={saving}>
          {saving ? "Logging…" : "Log it"}
        </button>

        {status && <p className="text-xs text-muted">{status}</p>}
      </div>
    </form>
  );
}
