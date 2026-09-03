"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useCallSession, type CallPhase } from "@/lib/use-call-session";
import type { CallRecord, CallType, Persona } from "@/lib/types";
import DifficultyDots from "./DifficultyDots";

const PHASE_COPY: Record<CallPhase, { label: string; tone: string }> = {
  idle: { label: "Ready to dial", tone: "text-muted" },
  connecting: { label: "Connecting…", tone: "text-accent" },
  listening: { label: "Your turn — speak", tone: "text-good" },
  thinking: { label: "Thinking…", tone: "text-warn" },
  speaking: { label: "Prospect speaking", tone: "text-accent" },
  ended: { label: "Call ended", tone: "text-muted" },
};

function formatTime(sec: number): string {
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
}

export default function CallConsole({
  persona,
  callType,
  repName,
  allowBargeIn,
}: {
  persona: Persona;
  callType: CallType;
  repName: string;
  allowBargeIn: boolean;
}) {
  const router = useRouter();
  const call = useCallSession({ persona, callType, repName, allowBargeIn });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const saved = useRef(false);

  // A call id is minted per mount so a re-render never forks the record.
  const callId = useMemo(
    () => `call_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    [],
  );

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [call.transcript, call.streaming, call.partial]);

  const persist = useCallback(async (): Promise<string | null> => {
    if (saved.current) return callId;
    saved.current = true;

    const record: CallRecord = {
      id: callId,
      repName,
      personaId: persona.id,
      personaName: persona.name,
      callType,
      difficulty: persona.difficulty,
      startedAt: new Date(Date.now() - call.elapsedSec * 1000).toISOString(),
      durationSec: call.elapsedSec,
      transcript: call.transcript,
      scorecard: null,
    };

    const res = await fetch("/api/calls", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(record),
    });

    if (!res.ok) {
      saved.current = false;
      const detail = await res.json().catch(() => null);
      throw new Error(detail?.error ?? "Could not save the call.");
    }
    return callId;
  }, [call.elapsedSec, call.transcript, callId, callType, persona, repName]);

  async function reviewCall() {
    setSaving(true);
    setSaveError(null);
    try {
      await persist();
      router.push(`/training/review/${callId}`);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Could not save the call.");
      setSaving(false);
    }
  }

  const hasRepSpeech = call.transcript.some((t) => t.speaker === "rep");
  const live = call.phase !== "idle" && call.phase !== "ended";
  const phase = PHASE_COPY[call.phase];

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
      <div className="flex min-h-[32rem] flex-col panel">
        <header className="flex items-center justify-between gap-4 border-b border-edge px-5 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">{persona.name}</span>
              <DifficultyDots value={persona.difficulty} />
            </div>
            <div className="truncate text-xs text-muted">
              {persona.title} · {persona.company}
            </div>
          </div>
          <div className="text-right">
            <div className="font-mono text-sm tabular-nums">{formatTime(call.elapsedSec)}</div>
            <div className={`text-xs ${phase.tone}`}>{phase.label}</div>
          </div>
        </header>

        <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
          {call.transcript.length === 0 && call.phase === "idle" && (
            <div className="grid h-full place-items-center text-center">
              <div>
                <p className="text-sm text-slate-300">
                  {persona.name.split(" ")[0]} is about to pick up.
                </p>
                <p className="mt-1 text-xs text-muted">
                  Your browser will ask for microphone access.
                </p>
              </div>
            </div>
          )}

          {call.transcript.map((turn, i) => (
            <Bubble key={i} speaker={turn.speaker} name={persona.name.split(" ")[0]}>
              {turn.text}
            </Bubble>
          ))}

          {call.streaming && (
            <Bubble speaker="prospect" name={persona.name.split(" ")[0]}>
              {call.streaming}
            </Bubble>
          )}

          {call.partial && (
            <Bubble speaker="rep" name="You" muted>
              {call.partial}
            </Bubble>
          )}
        </div>

        <footer className="border-t border-edge px-5 py-4">
          {call.error && (
            <p className="mb-3 rounded-lg bg-bad/10 px-3 py-2 text-xs text-red-300">
              {call.error}
            </p>
          )}
          {!call.micSupported && call.phase !== "idle" && (
            <p className="mb-3 rounded-lg bg-warn/10 px-3 py-2 text-xs text-amber-200">
              Speech recognition isn't available in this browser. Use Chrome, Edge, or Safari
              16.4+.
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            {call.phase === "idle" && (
              <button className="btn-primary" onClick={() => void call.start()}>
                Start call
              </button>
            )}

            {live && (
              <>
                <button
                  className="btn-ghost"
                  onClick={call.submitTurn}
                  disabled={call.phase !== "listening"}
                  title="Send what you've said without waiting for the pause"
                >
                  Done speaking
                </button>
                <button className="btn-danger" onClick={call.hangUp}>
                  Hang up
                </button>
              </>
            )}

            {call.phase === "ended" && (
              <>
                <button
                  className="btn-primary"
                  onClick={() => void reviewCall()}
                  disabled={saving || !hasRepSpeech}
                  title={hasRepSpeech ? undefined : "You didn't say anything on this call"}
                >
                  {saving ? "Saving…" : "Review this call"}
                </button>
                <button className="btn-ghost" onClick={() => router.push("/training/practice")}>
                  New call
                </button>
              </>
            )}
          </div>

          {saveError && <p className="mt-3 text-xs text-red-300">{saveError}</p>}

          {call.phase === "ended" && call.outcome && (
            <p className="mt-3 text-xs text-muted">
              {call.outcome === "meeting_booked" && "✅ You booked the meeting."}
              {call.outcome === "hung_up" && `📵 ${persona.name.split(" ")[0]} ended the call.`}
              {call.outcome === "rep_ended" && "You hung up."}
            </p>
          )}
        </footer>
      </div>

      <aside className="space-y-4">
        <div className="panel p-5">
          <div className="label">How this works</div>
          <ul className="space-y-2 text-xs leading-relaxed text-slate-400">
            <li>They speak first. Open however you normally would.</li>
            <li>
              Pause for about a second and a half when you're done — that's what sends your
              turn. Or hit <span className="text-slate-200">Done speaking</span>.
            </li>
            <li>
              {allowBargeIn
                ? "Interruptions are on: talk over them and they'll stop."
                : "Interruptions are off, so the mic mutes while they talk."}
            </li>
            <li>They'll hang up on you if you waste their time. That's the point.</li>
          </ul>
        </div>

        {persona.winCondition && (
          <div className="panel p-5">
            <div className="label">What wins them over</div>
            <p className="text-xs leading-relaxed text-slate-400">{persona.winCondition}</p>
            <p className="mt-3 text-[11px] text-muted">
              Shown here for training. The prospect won't tell you this on the call.
            </p>
          </div>
        )}
      </aside>
    </div>
  );
}

function Bubble({
  speaker,
  name,
  muted = false,
  children,
}: {
  speaker: "rep" | "prospect";
  name: string;
  muted?: boolean;
  children: React.ReactNode;
}) {
  const isRep = speaker === "rep";
  return (
    <div className={`flex ${isRep ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[80%] ${isRep ? "text-right" : "text-left"}`}>
        <div className="mb-1 text-[11px] uppercase tracking-wide text-muted">
          {isRep ? "You" : name}
        </div>
        <div
          className={`inline-block rounded-xl px-3.5 py-2 text-sm leading-relaxed ${
            isRep ? "bg-accent/15 text-slate-100" : "bg-edge text-slate-100"
          } ${muted ? "opacity-60" : ""}`}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
