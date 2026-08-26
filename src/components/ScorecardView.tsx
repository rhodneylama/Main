"use client";

import { useEffect, useRef, useState } from "react";
import type { Scorecard, Turn } from "@/lib/types";

const DIMENSIONS: { key: keyof Scorecard["breakdown"]; label: string; hint: string }[] = [
  { key: "opener", label: "Opener", hint: "Did the first 15 seconds earn the call?" },
  { key: "objectionHandling", label: "Objections", hint: "Acknowledged before answered?" },
  { key: "discovery", label: "Discovery", hint: "Questions that revealed something?" },
  { key: "talkListenBalance", label: "Talk / listen", hint: "Did you leave space?" },
  { key: "closing", label: "Close", hint: "Did you ask for something specific?" },
];

function scoreColor(score: number): string {
  if (score >= 80) return "text-good";
  if (score >= 60) return "text-warn";
  return "text-bad";
}

function barColor(score: number): string {
  if (score >= 80) return "bg-good";
  if (score >= 60) return "bg-warn";
  return "bg-bad";
}

export default function ScorecardView({
  callId,
  initialScorecard,
  transcript,
  prospectName,
}: {
  callId: string;
  initialScorecard: Scorecard | null;
  transcript: Turn[];
  prospectName: string;
}) {
  const [scorecard, setScorecard] = useState<Scorecard | null>(initialScorecard);
  const [loading, setLoading] = useState(!initialScorecard);
  const [error, setError] = useState<string | null>(null);
  const requested = useRef(false);

  useEffect(() => {
    if (scorecard || requested.current) return;
    requested.current = true;

    (async () => {
      try {
        const res = await fetch("/api/score", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ callId }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Scoring failed.");
        setScorecard(data.scorecard as Scorecard);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Scoring failed.");
      } finally {
        setLoading(false);
      }
    })();
  }, [callId, scorecard]);

  function retry() {
    requested.current = false;
    setError(null);
    setLoading(true);
    setScorecard(null);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <div className="space-y-6">
        {loading && (
          <div className="panel p-8 text-center">
            <div className="text-sm text-slate-300">Your coach is reviewing the call…</div>
            <div className="mt-1 text-xs text-muted">This takes a few seconds.</div>
          </div>
        )}

        {error && (
          <div className="panel border-bad/40 bg-bad/10 p-5">
            <p className="text-sm text-red-300">{error}</p>
            <button className="btn-ghost mt-3" onClick={retry}>
              Try again
            </button>
          </div>
        )}

        {scorecard && (
          <>
            <section className="panel p-5">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="label">Overall</div>
                  <div className={`text-4xl font-semibold ${scoreColor(scorecard.overall)}`}>
                    {scorecard.overall}
                    <span className="text-lg text-muted">/100</span>
                  </div>
                </div>
                <div className="flex gap-6 text-right">
                  <div>
                    <div className="label">Meeting</div>
                    <div
                      className={`text-sm font-medium ${
                        scorecard.meetingBooked ? "text-good" : "text-muted"
                      }`}
                    >
                      {scorecard.meetingBooked ? "Booked" : "Not booked"}
                    </div>
                  </div>
                  <div>
                    <div className="label">You talked</div>
                    <div className="text-sm font-medium">
                      {Math.round(scorecard.repTalkRatio * 100)}%
                    </div>
                  </div>
                </div>
              </div>
              <p className="mt-4 border-t border-edge pt-4 text-sm leading-relaxed text-slate-300">
                {scorecard.summary}
              </p>
            </section>

            <section className="panel p-5">
              <div className="label">Breakdown</div>
              <div className="space-y-3">
                {DIMENSIONS.map((dim) => {
                  const value = scorecard.breakdown[dim.key];
                  return (
                    <div key={dim.key}>
                      <div className="flex items-baseline justify-between text-sm">
                        <span>{dim.label}</span>
                        <span className={`font-mono tabular-nums ${scoreColor(value)}`}>
                          {value}
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-edge">
                        <div
                          className={`h-full rounded-full ${barColor(value)}`}
                          style={{ width: `${value}%` }}
                        />
                      </div>
                      <div className="mt-1 text-[11px] text-muted">{dim.hint}</div>
                    </div>
                  );
                })}
              </div>
            </section>

            {scorecard.coaching.length > 0 && (
              <section className="panel p-5">
                <div className="label">Moments to fix</div>
                <div className="space-y-4">
                  {scorecard.coaching.map((item, i) => (
                    <div key={i} className="border-l-2 border-warn pl-3">
                      <div className="text-xs font-medium uppercase tracking-wide text-warn">
                        {item.moment}
                      </div>
                      <p className="mt-1 text-sm text-slate-300">{item.whatHappened}</p>
                      <p className="mt-2 text-sm text-slate-100">
                        <span className="text-muted">Try instead: </span>
                        <span className="italic">“{item.tryInstead}”</span>
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section className="panel p-5">
              <div className="label">Transcript</div>
              <div className="space-y-2.5">
                {transcript.map((turn, i) => (
                  <div key={i} className="text-sm leading-relaxed">
                    <span
                      className={`mr-2 text-xs font-medium uppercase tracking-wide ${
                        turn.speaker === "rep" ? "text-accent" : "text-muted"
                      }`}
                    >
                      {turn.speaker === "rep" ? "You" : prospectName}
                    </span>
                    <span className="text-slate-300">{turn.text}</span>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </div>

      {scorecard && (
        <aside className="space-y-4">
          <div className="panel p-5">
            <div className="label">What worked</div>
            {scorecard.strengths.length === 0 ? (
              <p className="text-xs text-muted">Nothing stood out on this one.</p>
            ) : (
              <ul className="space-y-2 text-sm text-slate-300">
                {scorecard.strengths.map((s, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-good">▸</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="panel p-5">
            <div className="label">What to work on</div>
            <ul className="space-y-2 text-sm text-slate-300">
              {scorecard.improvements.map((s, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-warn">▸</span>
                  <span>{s}</span>
                </li>
              ))}
            </ul>
          </div>

          {scorecard.fillerWords.length > 0 && (
            <div className="panel p-5">
              <div className="label">Filler words</div>
              <div className="flex flex-wrap gap-2">
                {scorecard.fillerWords.map((f) => (
                  <span
                    key={f.word}
                    className="rounded-full bg-edge px-2.5 py-1 text-xs text-slate-300"
                  >
                    {f.word} <span className="text-muted">×{f.count}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </aside>
      )}
    </div>
  );
}
