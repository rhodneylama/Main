import Link from "next/link";
import { listCalls, repStats } from "@/lib/db";
import DifficultyDots from "@/components/DifficultyDots";

// Reads the database on every request — prerendering this would freeze the
// page at build-time data.
export const dynamic = "force-dynamic";

function scoreColor(score: number): string {
  if (score >= 80) return "text-good";
  if (score >= 60) return "text-warn";
  return "text-bad";
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function HistoryPage() {
  const calls = listCalls();
  const stats = repStats();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">History</h1>
        <p className="mt-1 text-sm text-muted">
          Every practice call, and how the team is tracking.
        </p>
      </div>

      {calls.length === 0 ? (
        <div className="panel p-8 text-center">
          <p className="text-sm text-slate-300">No calls yet.</p>
          <Link href="/" className="btn-primary mt-4">
            Make the first one
          </Link>
        </div>
      ) : (
        <>
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
              Leaderboard
            </h2>
            <div className="panel overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-edge text-left text-xs uppercase tracking-wide text-muted">
                    <th className="px-4 py-3 font-medium">Rep</th>
                    <th className="px-4 py-3 text-right font-medium">Calls</th>
                    <th className="px-4 py-3 text-right font-medium">Avg</th>
                    <th className="px-4 py-3 text-right font-medium">Best</th>
                    <th className="px-4 py-3 text-right font-medium">Meetings</th>
                    <th className="px-4 py-3 text-right font-medium">Last call</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.map((rep) => (
                    <tr key={rep.repName} className="border-b border-edge last:border-0">
                      <td className="px-4 py-3 font-medium">{rep.repName}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-400">
                        {rep.calls}
                      </td>
                      <td className={`px-4 py-3 text-right tabular-nums ${scoreColor(rep.avgScore)}`}>
                        {rep.avgScore || "—"}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-400">
                        {rep.bestScore || "—"}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-400">
                        {rep.meetingsBooked}
                      </td>
                      <td className="px-4 py-3 text-right text-xs text-muted">
                        {formatDate(rep.lastCallAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
              Calls
            </h2>
            <div className="space-y-2">
              {calls.map((call) => (
                <Link
                  key={call.id}
                  href={`/review/${call.id}`}
                  className="panel flex flex-wrap items-center justify-between gap-4 p-4 transition-colors hover:border-slate-600"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-medium">{call.repName}</span>
                      <span className="text-muted">→</span>
                      <span>{call.personaName}</span>
                      <DifficultyDots value={call.difficulty} />
                    </div>
                    <div className="mt-0.5 text-xs text-muted">
                      {call.callType.replace("_", " ")} · {Math.floor(call.durationSec / 60)}m{" "}
                      {call.durationSec % 60}s · {formatDate(call.startedAt)}
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    {call.scorecard?.meetingBooked && (
                      <span className="rounded-full bg-good/15 px-2.5 py-1 text-xs text-good">
                        Meeting booked
                      </span>
                    )}
                    <div className="text-right">
                      {call.scorecard ? (
                        <span
                          className={`text-lg font-semibold tabular-nums ${scoreColor(
                            call.scorecard.overall,
                          )}`}
                        >
                          {call.scorecard.overall}
                        </span>
                      ) : (
                        <span className="text-xs text-muted">Not scored</span>
                      )}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
