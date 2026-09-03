"use client";

import { useEffect, useMemo, useState } from "react";
import { money, number, percent, relativeTime } from "@/lib/format";
import type { Celebration, LeaderboardEntry } from "@/lib/types";
import type { TvPayload } from "@/lib/tv";

const TEAM_COLORS = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181"];

/** As many rows as fit a 1080p screen without the last one falling off. */
const TV_ROWS = 6;

/** How long each board stays up, and how often the data is re-pulled. */
const ROTATE_MS = 15_000;
const REFRESH_MS = 30_000;

type BoardKey = "reps" | "teams" | "competition" | "numbers";

function useRotation(keys: BoardKey[]) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (keys.length <= 1) return;
    const timer = setInterval(() => setIndex((i) => (i + 1) % keys.length), ROTATE_MS);
    return () => clearInterval(timer);
  }, [keys.length]);

  return keys[index % keys.length];
}

function BoardRows({ entries, metricLabel }: { entries: LeaderboardEntry[]; metricLabel: string }) {
  const max = Math.max(1, ...entries.map((e) => e.value));

  return (
    <ol className="space-y-3">
      {entries.slice(0, TV_ROWS).map((entry) => (
        <li
          key={entry.id}
          className="relative overflow-hidden rounded-xl border border-edge bg-panel px-5 py-3"
        >
          <div
            className="absolute inset-y-0 left-0"
            style={{
              width: `${(entry.value / max) * 100}%`,
              backgroundImage: `linear-gradient(90deg, ${
                TEAM_COLORS[(entry.colorSlot - 1) % TEAM_COLORS.length]
              }55, ${TEAM_COLORS[(entry.colorSlot - 1) % TEAM_COLORS.length]}11)`,
            }}
            aria-hidden
          />
          <div className="relative flex items-center gap-5">
            <span className="w-10 text-center text-3xl font-bold tabular-nums text-muted">
              {entry.rank}
            </span>
            <span className="text-4xl" aria-hidden>
              {entry.avatar}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-tv text-white">{entry.name}</div>
              {entry.teamName && (
                <div className="text-lg text-muted">
                  {entry.teamName} · Lv{entry.level.level} {entry.level.name}
                </div>
              )}
            </div>
            <div className="text-right">
              <div className="text-tv tabular-nums text-white">
                {metricLabel === "revenue"
                  ? money(entry.revenueCents, { compact: true })
                  : number(entry.value)}
              </div>
              <div className="text-base text-muted">{metricLabel}</div>
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

/**
 * The office display. No chrome, no interaction — it rotates between boards on
 * its own and re-pulls the numbers on a timer, so a browser left open on a wall
 * screen stays current without anyone touching it.
 */
export default function TvBoard({ initial }: { initial: TvPayload }) {
  const [payload, setPayload] = useState(initial);
  const [flash, setFlash] = useState<Celebration | null>(null);
  const [seen, setSeen] = useState<Set<string>>(
    () => new Set(initial.dashboard.celebrations.map((c) => c.id)),
  );

  useEffect(() => {
    const timer = setInterval(async () => {
      try {
        const res = await fetch("/api/tv", { cache: "no-store" });
        if (!res.ok) return;
        const next = (await res.json()) as TvPayload;
        setPayload(next);

        // Anything that appeared since the last pull gets its moment on screen.
        const fresh = next.dashboard.celebrations.find((c) => !seen.has(c.id));
        if (fresh) {
          setFlash(fresh);
          setSeen((prev) => new Set([...prev, ...next.dashboard.celebrations.map((c) => c.id)]));
          setTimeout(() => setFlash(null), 9000);
        }
      } catch {
        /* keep the last good board on the wall */
      }
    }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [seen]);

  const boards = useMemo<BoardKey[]>(() => {
    const keys: BoardKey[] = ["reps", "numbers"];
    if (payload.teamBoard.length > 0) keys.splice(1, 0, "teams");
    if (payload.competition) keys.splice(keys.length - 1, 0, "competition");
    return keys;
  }, [payload.teamBoard.length, payload.competition]);

  const board = useRotation(boards);
  const { dashboard: data, competition } = payload;

  return (
    <div className="min-h-screen bg-ink px-10 py-8 text-slate-100">
      <header className="flex items-baseline justify-between border-b border-edge pb-5">
        <h1 className="text-tv-lg tracking-tight text-white">
          {board === "reps" && "Leaderboard"}
          {board === "teams" && "Team standings"}
          {board === "competition" && (competition?.name ?? "Competition")}
          {board === "numbers" && "This month"}
        </h1>
        <div className="text-right">
          <div className="text-tv tabular-nums text-status-good">
            {money(data.wonRevenueCents, { compact: true })}
          </div>
          <div className="text-lg text-muted">closed this month</div>
        </div>
      </header>

      <div className="mt-8">
        {board === "reps" && <BoardRows entries={payload.repBoard} metricLabel="points" />}
        {board === "teams" && <BoardRows entries={payload.teamBoard} metricLabel="points" />}

        {board === "competition" && competition && (
          <div>
            <p className="mb-6 text-2xl text-muted">
              {competition.description}
              {competition.prize && ` · ${competition.prize}`}
            </p>
            <ol className="space-y-3">
              {competition.standings.slice(0, TV_ROWS).map((s) => (
                <li
                  key={s.id}
                  className="flex items-center gap-5 rounded-xl border border-edge bg-panel px-5 py-3"
                >
                  <span className="w-10 text-center text-3xl font-bold tabular-nums text-muted">
                    {s.rank}
                  </span>
                  <span className="text-4xl" aria-hidden>
                    {s.avatar}
                  </span>
                  <span className="flex-1 truncate text-tv text-white">{s.name}</span>
                  <div className="h-4 w-1/3 overflow-hidden rounded-full bg-edge">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${
                          competition.target > 0
                            ? s.progress * 100
                            : (s.value / Math.max(1, competition.standings[0].value)) * 100
                        }%`,
                        backgroundColor: TEAM_COLORS[(s.colorSlot - 1) % TEAM_COLORS.length],
                      }}
                    />
                  </div>
                  <span className="w-48 text-right text-tv tabular-nums text-white">
                    {competition.metric === "revenue"
                      ? money(s.value, { compact: true })
                      : number(s.value)}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        )}

        {board === "numbers" && (
          <div className="grid grid-cols-2 gap-6">
            {[
              { label: "Deals won", value: number(data.wonDeals) },
              { label: "Open pipeline", value: money(data.openPipelineCents, { compact: true }) },
              { label: "Activity today", value: number(data.activitiesToday) },
              { label: "Appointments set", value: number(data.appointmentsSet) },
              { label: "Win rate", value: percent(data.winRate) },
              { label: "Quota attainment", value: percent(data.quotaAttainment) },
            ].map((tile) => (
              <div key={tile.label} className="rounded-xl border border-edge bg-panel px-6 py-6">
                <div className="text-xl text-muted">{tile.label}</div>
                <div className="mt-2 text-tv-lg tabular-nums text-white">{tile.value}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {flash && (
        <div className="fixed inset-x-0 bottom-0 animate-slide-up border-t-4 border-status-good bg-panel px-10 py-8">
          <div className="flex items-center gap-6">
            <span className="relative text-7xl" aria-hidden>
              <span className="absolute inset-0 animate-pulse-ring rounded-full bg-status-good/30" />
              🎉
            </span>
            <div>
              <div className="text-tv-lg text-white">{flash.headline}</div>
              <div className="text-2xl text-muted">
                {flash.detail}
                {flash.valueCents > 0 && (
                  <span className="ml-3 font-semibold text-status-good">
                    {money(flash.valueCents)}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <footer className="mt-10 flex items-center justify-between border-t border-edge pt-5 text-base text-muted">
        <span>
          {boards.map((key) => (
            <span
              key={key}
              className={`mr-2 inline-block h-2 w-2 rounded-full ${
                key === board ? "bg-accent" : "bg-edge"
              }`}
              aria-hidden
            />
          ))}
        </span>
        <span>
          {data.celebrations[0]
            ? `Last win ${relativeTime(data.celebrations[0].createdAt)}`
            : "Sales Floor"}
        </span>
      </footer>
    </div>
  );
}
