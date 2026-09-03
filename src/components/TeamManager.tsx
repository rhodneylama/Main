"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { money, number } from "@/lib/format";
import type { LeaderboardEntry, Rep, Team } from "@/lib/types";

const TEAM_COLORS = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181"];

const AVATARS = ["🦊", "🐙", "🐻", "🦅", "🐝", "🐺", "🦉", "🦁", "🐬", "🦄", "🐢", "🦈"];

export default function TeamManager({
  reps,
  teams,
  stats,
}: {
  reps: Rep[];
  teams: Team[];
  /** Month-to-date totals, keyed by rep id. */
  stats: Record<string, LeaderboardEntry>;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function post(url: string, body: unknown) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "That didn't save.");
      router.refresh();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't save.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function addRep(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const ok = await post("/api/reps", {
      name: data.get("name"),
      email: data.get("email"),
      teamId: data.get("teamId") || null,
      avatar: data.get("avatar"),
      quotaCents: Math.round(Number(data.get("quota")) * 100) || 0,
    });
    if (ok) form.reset();
  }

  async function addTeam(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const ok = await post("/api/teams", {
      name: data.get("name"),
      colorSlot: Number(data.get("colorSlot")) || 1,
    });
    if (ok) form.reset();
  }

  async function updateRep(rep: Rep, patch: Partial<Rep>) {
    await post("/api/reps", { ...rep, ...patch });
  }

  async function removeRep(rep: Rep) {
    setBusy(true);
    await fetch(`/api/reps/${rep.id}`, { method: "DELETE" });
    router.refresh();
    setBusy(false);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Team</h1>
        <p className="mt-1 text-sm text-muted">
          Reps, teams and quotas. Syncing GoHighLevel links its users to these records by name, so
          nobody ends up on the board twice.
        </p>
      </div>

      {error && <p className="text-sm text-bad">{error}</p>}

      <div className="panel overflow-hidden">
        <div className="scroll-x">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-edge text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-4 py-2.5 font-medium">Rep</th>
                <th className="px-4 py-2.5 font-medium">Team</th>
                <th className="px-4 py-2.5 text-right font-medium">Monthly quota</th>
                <th className="px-4 py-2.5 text-right font-medium">Closed MTD</th>
                <th className="px-4 py-2.5 text-right font-medium">Points MTD</th>
                <th className="px-4 py-2.5 text-right font-medium">GHL</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {reps.map((rep) => {
                const stat = stats[rep.id];
                return (
                  <tr key={rep.id} className="border-b border-edge/60 last:border-0">
                    <td className="px-4 py-2.5">
                      <span className="mr-2" aria-hidden>
                        {rep.avatar}
                      </span>
                      <span className="font-medium text-white">{rep.name}</span>
                      {rep.email && <div className="text-xs text-muted">{rep.email}</div>}
                    </td>
                    <td className="px-4 py-2.5">
                      <select
                        className="rounded border border-edge bg-ink px-2 py-1 text-xs"
                        value={rep.teamId ?? ""}
                        disabled={busy}
                        onChange={(e) => updateRep(rep, { teamId: e.target.value || null })}
                      >
                        <option value="">No team</option>
                        {teams.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <input
                        type="number"
                        min={0}
                        className="w-28 rounded border border-edge bg-ink px-2 py-1 text-right text-xs tabular-nums"
                        defaultValue={rep.quotaCents / 100}
                        disabled={busy}
                        onBlur={(e) => {
                          const cents = Math.round(Number(e.target.value) * 100) || 0;
                          if (cents !== rep.quotaCents) updateRep(rep, { quotaCents: cents });
                        }}
                      />
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-slate-200">
                      {money(stat?.revenueCents ?? 0, { compact: true })}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-slate-200">
                      {number(stat?.points ?? 0)}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {rep.ghlUserId ? (
                        <span className="chip border-status-good/40 text-status-good">Linked</span>
                      ) : (
                        <span className="chip">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <button
                        type="button"
                        className="btn-ghost !px-2 !py-1 text-xs"
                        disabled={busy}
                        onClick={() => removeRep(rep)}
                        title="Deactivate — their history stays on past boards"
                      >
                        Deactivate
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <form onSubmit={addRep} className="panel space-y-3 p-4">
          <h2 className="text-sm font-semibold text-white">Add a rep</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="rep-name">
                Name
              </label>
              <input id="rep-name" name="name" className="field" required />
            </div>
            <div>
              <label className="label" htmlFor="rep-email">
                Email
              </label>
              <input id="rep-email" name="email" type="email" className="field" />
            </div>
            <div>
              <label className="label" htmlFor="rep-team">
                Team
              </label>
              <select id="rep-team" name="teamId" className="field">
                <option value="">No team</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="rep-quota">
                Monthly quota
              </label>
              <input id="rep-quota" name="quota" type="number" min={0} className="field" />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="rep-avatar">
              Avatar
            </label>
            <select id="rep-avatar" name="avatar" className="field">
              {AVATARS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn-primary" disabled={busy}>
            Add rep
          </button>
        </form>

        <div className="space-y-4">
          <form onSubmit={addTeam} className="panel space-y-3 p-4">
            <h2 className="text-sm font-semibold text-white">Add a team</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="team-name">
                  Name
                </label>
                <input id="team-name" name="name" className="field" required />
              </div>
              <div>
                <label className="label" htmlFor="team-color">
                  Colour
                </label>
                <select id="team-color" name="colorSlot" className="field">
                  {TEAM_COLORS.map((_, i) => (
                    <option key={i} value={i + 1}>
                      Slot {i + 1}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <button type="submit" className="btn-primary" disabled={busy}>
              Add team
            </button>
          </form>

          <div className="panel p-4">
            <h2 className="mb-3 text-sm font-semibold text-white">Teams</h2>
            {teams.length === 0 ? (
              <p className="text-sm text-muted">No teams yet.</p>
            ) : (
              <ul className="space-y-2">
                {teams.map((team) => (
                  <li key={team.id} className="flex items-center gap-2.5 text-sm">
                    <span
                      className="h-3 w-3 rounded-full"
                      style={{
                        backgroundColor: TEAM_COLORS[(team.colorSlot - 1) % TEAM_COLORS.length],
                      }}
                      aria-hidden
                    />
                    <span className="flex-1 text-slate-200">{team.name}</span>
                    <span className="text-xs text-muted">
                      {reps.filter((r) => r.teamId === team.id).length} reps
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
