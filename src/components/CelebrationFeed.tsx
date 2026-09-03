import { money, relativeTime } from "@/lib/format";
import type { Celebration } from "@/lib/types";

const ICONS: Record<Celebration["kind"], string> = {
  deal_won: "💰",
  appointment_set: "📅",
  badge: "🏅",
  level_up: "⬆️",
  competition_won: "🏆",
  training_ace: "🎯",
};

/** The "what just happened" rail. Newest first, deliberately short. */
export default function CelebrationFeed({
  celebrations,
  limit = 8,
}: {
  celebrations: Celebration[];
  limit?: number;
}) {
  if (celebrations.length === 0) {
    return (
      <div className="panel p-4">
        <h2 className="text-sm font-semibold text-white">Latest wins</h2>
        <p className="mt-3 text-sm text-muted">
          Nothing yet today. Wins land here the moment they close.
        </p>
      </div>
    );
  }

  return (
    <div className="panel p-4">
      <h2 className="mb-3 text-sm font-semibold text-white">Latest wins</h2>
      <ul className="space-y-2.5">
        {celebrations.slice(0, limit).map((c) => (
          <li key={c.id} className="flex gap-2.5">
            <span className="text-base leading-6" aria-hidden>
              {ICONS[c.kind] ?? "✨"}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-slate-200">
                {c.headline}
                {c.valueCents > 0 && (
                  <span className="ml-1.5 font-semibold text-status-good">
                    {money(c.valueCents, { compact: true })}
                  </span>
                )}
              </p>
              <p className="truncate text-xs text-muted">
                {c.detail}
                {c.detail && " · "}
                {relativeTime(c.createdAt)}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
