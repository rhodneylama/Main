import { leaderboard } from "@/lib/sales-db";
import { ensureSeeded } from "@/lib/seed-demo";
import { BADGES } from "@/lib/points";
import Leaderboard from "@/components/Leaderboard";

export const dynamic = "force-dynamic";

export default function LeaderboardPage() {
  ensureSeeded();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Leaderboard</h1>
        <p className="mt-1 text-sm text-muted">
          Points come from logged activity, closed revenue and practice calls. Pick a period and a
          measure — the ranking follows whichever you choose.
        </p>
      </div>

      <Leaderboard initialEntries={leaderboard("month", "points")} />

      <div className="panel p-4">
        <h2 className="text-sm font-semibold text-white">Badges</h2>
        <p className="mt-0.5 text-xs text-muted">
          Awarded automatically. They stay on your name once earned.
        </p>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {BADGES.map((badge) => (
            <li key={badge.key} className="flex gap-2.5 rounded-lg border border-edge/70 p-2.5">
              <span className="text-lg" aria-hidden>
                {badge.icon}
              </span>
              <div>
                <div className="text-sm font-medium text-white">{badge.name}</div>
                <div className="text-xs text-muted">{badge.description}</div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
