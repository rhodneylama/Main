"use client";

import { useEffect, useState } from "react";
import { money, number } from "@/lib/format";
import { levelProgress } from "@/lib/points";
import type { LeaderboardEntry, LeaderboardMetric, LeaderboardPeriod } from "@/lib/types";

const PERIODS: { key: LeaderboardPeriod; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
  { key: "quarter", label: "Quarter" },
  { key: "all", label: "All time" },
];

const METRICS: { key: LeaderboardMetric; label: string }[] = [
  { key: "points", label: "Points" },
  { key: "revenue", label: "Revenue" },
  { key: "deals", label: "Deals" },
  { key: "activities", label: "Activity" },
];

const TEAM_COLORS = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181"];

export function formatMetric(entry: LeaderboardEntry, metric: LeaderboardMetric): string {
  if (metric === "revenue") return money(entry.revenueCents, { compact: true });
  return number(entry.value);
}

const MEDALS = ["🥇", "🥈", "🥉"];

export default function Leaderboard({
  initialEntries = [],
  initialPeriod = "month",
  initialMetric = "points",
  compact = false,
}: {
  initialEntries?: LeaderboardEntry[];
  initialPeriod?: LeaderboardPeriod;
  initialMetric?: LeaderboardMetric;
  /** Hides the filters and the level bars, for the dashboard's preview board. */
  compact?: boolean;
}) {
  const [period, setPeriod] = useState<LeaderboardPeriod>(initialPeriod);
  const [metric, setMetric] = useState<LeaderboardMetric>(initialMetric);
  const [scope, setScope] = useState<"rep" | "team">("rep");
  const [entries, setEntries] = useState<LeaderboardEntry[]>(initialEntries);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (compact) return;
    let cancelled = false;
    setLoading(true);
    fetch(`/api/leaderboard?period=${period}&metric=${metric}&scope=${scope}`)
      .then((r) => r.json())
      .then((data: { entries?: LeaderboardEntry[] }) => {
        if (!cancelled) setEntries(data.entries ?? []);
      })
      .catch(() => {
        /* leave the previous board on screen rather than blanking it */
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [period, metric, scope, compact]);

  const max = Math.max(1, ...entries.map((e) => e.value));

  return (
    <div className="panel p-4">
      {!compact && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="segmented">
            {PERIODS.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => setPeriod(p.key)}
                className={`segmented-item ${period === p.key ? "segmented-item-active" : ""}`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="segmented">
            {METRICS.map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => setMetric(m.key)}
                className={`segmented-item ${metric === m.key ? "segmented-item-active" : ""}`}
              >
                {m.label}
              </button>
            ))}
          </div>
          <div className="segmented">
            {(["rep", "team"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setScope(s)}
                className={`segmented-item ${scope === s ? "segmented-item-active" : ""}`}
              >
                {s === "rep" ? "Reps" : "Teams"}
              </button>
            ))}
          </div>
          {loading && <span className="text-xs text-muted">Updating…</span>}
        </div>
      )}

      {entries.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">
          Nothing on the board for this period yet.
        </p>
      ) : (
        <ol className="space-y-1.5">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className="relative overflow-hidden rounded-lg border border-edge/70 bg-ink/40 px-3 py-2.5"
            >
              {/* The bar is a background layer so the row's text stays fully legible. */}
              <div
                className="absolute inset-y-0 left-0"
                style={{
                  width: `${(entry.value / max) * 100}%`,
                  backgroundImage: `linear-gradient(90deg, ${
                    TEAM_COLORS[(entry.colorSlot - 1) % TEAM_COLORS.length]
                  }38, ${TEAM_COLORS[(entry.colorSlot - 1) % TEAM_COLORS.length]}08)`,
                }}
                aria-hidden
              />
              <div className="relative flex items-center gap-3">
                <span className="w-7 text-center text-sm font-semibold tabular-nums text-muted">
                  {entry.rank <= 3 ? MEDALS[entry.rank - 1] : entry.rank}
                </span>
                <span className="text-xl" aria-hidden>
                  {entry.avatar}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-medium text-white">{entry.name}</span>
                    {entry.teamName && scope === "rep" && (
                      <span className="chip">
                        <span
                          className="h-1.5 w-1.5 rounded-full"
                          style={{
                            backgroundColor:
                              TEAM_COLORS[(entry.colorSlot - 1) % TEAM_COLORS.length],
                          }}
                          aria-hidden
                        />
                        {entry.teamName}
                      </span>
                    )}
                    {entry.badges.slice(0, 4).map((badge) => (
                      <span key={badge.key} title={`${badge.name} — ${badge.description}`}>
                        {badge.icon}
                      </span>
                    ))}
                  </div>
                  {!compact && (
                    <div className="mt-1 flex items-center gap-2">
                      <span className="text-[11px] text-muted">
                        Lv{entry.level.level} {entry.level.name}
                      </span>
                      <div className="h-1 w-24 overflow-hidden rounded-full bg-edge">
                        <div
                          className="h-full rounded-full bg-series-1"
                          style={{ width: `${levelProgress(entry.points) * 100}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold tabular-nums text-white">
                    {formatMetric(entry, metric)}
                  </div>
                  {metric !== "points" && (
                    <div className="text-[11px] tabular-nums text-muted">
                      {number(entry.points)} pts
                    </div>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
