"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { money, number, shortDate } from "@/lib/format";
import type { Competition, CompetitionStanding } from "@/lib/types";

export interface CompetitionView extends Competition {
  status: "upcoming" | "live" | "ended";
  standings: CompetitionStanding[];
}

const TEAM_COLORS = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181"];

const STATUS_STYLE: Record<CompetitionView["status"], string> = {
  live: "border-status-good/40 text-status-good",
  upcoming: "border-edge text-muted",
  ended: "border-edge text-muted",
};

function formatValue(value: number, metric: Competition["metric"]): string {
  return metric === "revenue" ? money(value, { compact: true }) : number(value);
}

/** Today and a month out, as the date inputs want them. */
function defaultRange() {
  const start = new Date();
  const end = new Date();
  end.setDate(end.getDate() + 30);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

export default function CompetitionManager({ competitions }: { competitions: CompetitionView[] }) {
  const router = useRouter();
  const range = defaultRange();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    name: "",
    description: "",
    metric: "revenue" as Competition["metric"],
    scope: "rep" as Competition["scope"],
    startsAt: range.start,
    endsAt: range.end,
    target: "",
    prize: "",
  });

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/competitions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          // Revenue targets are entered in whole currency units, stored in cents.
          target:
            form.metric === "revenue"
              ? Math.round(Number(form.target) * 100) || 0
              : Math.round(Number(form.target)) || 0,
          startsAt: new Date(`${form.startsAt}T00:00:00`).toISOString(),
          endsAt: new Date(`${form.endsAt}T23:59:59`).toISOString(),
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not create that competition.");

      setOpen(false);
      setForm({ ...form, name: "", description: "", target: "", prize: "" });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create that competition.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    await fetch(`/api/competitions/${id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Competitions</h1>
          <p className="mt-1 text-sm text-muted">
            Run a sprint on any measure the board already tracks. Standings score over the
            competition&rsquo;s own dates.
          </p>
        </div>
        <button type="button" className="btn-primary" onClick={() => setOpen((v) => !v)}>
          {open ? "Cancel" : "New competition"}
        </button>
      </div>

      {open && (
        <form onSubmit={create} className="panel space-y-3 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="comp-name">
                Name
              </label>
              <input
                id="comp-name"
                className="field"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Month-end Sprint"
              />
            </div>
            <div>
              <label className="label" htmlFor="comp-prize">
                Prize
              </label>
              <input
                id="comp-prize"
                className="field"
                value={form.prize}
                onChange={(e) => setForm({ ...form, prize: e.target.value })}
                placeholder="Friday off"
              />
            </div>
          </div>

          <div>
            <label className="label" htmlFor="comp-description">
              Rules
            </label>
            <input
              id="comp-description"
              className="field"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Most revenue closed before the month is out."
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-4">
            <div>
              <label className="label" htmlFor="comp-metric">
                Measure
              </label>
              <select
                id="comp-metric"
                className="field"
                value={form.metric}
                onChange={(e) =>
                  setForm({ ...form, metric: e.target.value as Competition["metric"] })
                }
              >
                <option value="revenue">Revenue</option>
                <option value="points">Points</option>
                <option value="deals">Deals won</option>
                <option value="activities">Activity</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="comp-scope">
                Between
              </label>
              <select
                id="comp-scope"
                className="field"
                value={form.scope}
                onChange={(e) =>
                  setForm({ ...form, scope: e.target.value as Competition["scope"] })
                }
              >
                <option value="rep">Reps</option>
                <option value="team">Teams</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="comp-start">
                Starts
              </label>
              <input
                id="comp-start"
                type="date"
                className="field"
                required
                value={form.startsAt}
                onChange={(e) => setForm({ ...form, startsAt: e.target.value })}
              />
            </div>
            <div>
              <label className="label" htmlFor="comp-end">
                Ends
              </label>
              <input
                id="comp-end"
                type="date"
                className="field"
                required
                value={form.endsAt}
                onChange={(e) => setForm({ ...form, endsAt: e.target.value })}
              />
            </div>
          </div>

          <div className="sm:w-48">
            <label className="label" htmlFor="comp-target">
              Target <span className="normal-case text-muted">(optional)</span>
            </label>
            <input
              id="comp-target"
              type="number"
              min={0}
              className="field"
              value={form.target}
              onChange={(e) => setForm({ ...form, target: e.target.value })}
              placeholder={form.metric === "revenue" ? "25000" : "1500"}
            />
          </div>

          {error && <p className="text-sm text-bad">{error}</p>}

          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? "Creating…" : "Create competition"}
          </button>
        </form>
      )}

      {competitions.length === 0 ? (
        <div className="panel p-6 text-center text-sm text-muted">
          No competitions yet. Start one and it shows up on the TV board immediately.
        </div>
      ) : (
        <div className="space-y-4">
          {competitions.map((c) => (
            <section key={c.id} className="panel p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-semibold text-white">{c.name}</h2>
                    <span className={`chip ${STATUS_STYLE[c.status]}`}>
                      {c.status === "live" ? "Live" : c.status === "upcoming" ? "Upcoming" : "Ended"}
                    </span>
                    <span className="chip">{c.scope === "team" ? "Teams" : "Reps"}</span>
                  </div>
                  {c.description && <p className="mt-1 text-sm text-muted">{c.description}</p>}
                  <p className="mt-1 text-xs text-muted">
                    {shortDate(c.startsAt)} – {shortDate(c.endsAt)}
                    {c.prize && ` · ${c.prize}`}
                    {c.target > 0 && ` · target ${formatValue(c.target, c.metric)}`}
                  </p>
                </div>
                <button
                  type="button"
                  className="btn-ghost !px-2.5 !py-1 text-xs"
                  onClick={() => remove(c.id)}
                >
                  Delete
                </button>
              </div>

              {c.standings.length > 0 && (
                <ol className="mt-4 space-y-1.5">
                  {c.standings.slice(0, 5).map((s) => (
                    <li key={s.id} className="flex items-center gap-3">
                      <span className="w-5 text-xs font-semibold tabular-nums text-muted">
                        {s.rank}
                      </span>
                      <span aria-hidden>{s.avatar}</span>
                      <span className="w-40 truncate text-sm text-slate-200">{s.name}</span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-edge">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${
                              c.target > 0
                                ? s.progress * 100
                                : (s.value / Math.max(1, c.standings[0].value)) * 100
                            }%`,
                            backgroundColor: TEAM_COLORS[(s.colorSlot - 1) % TEAM_COLORS.length],
                          }}
                        />
                      </div>
                      <span className="w-24 text-right text-sm font-medium tabular-nums text-white">
                        {formatValue(s.value, c.metric)}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
