"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DIFFICULTY_LABELS, type CallType, type Persona } from "@/lib/types";
import DifficultyDots from "./DifficultyDots";

const CALL_TYPES: { value: CallType; label: string; blurb: string }[] = [
  { value: "cold_call", label: "Cold call", blurb: "They never asked to hear from you." },
  { value: "discovery", label: "Discovery", blurb: "They agreed to talk. Ask good questions." },
  { value: "closing", label: "Closing", blurb: "They've seen it. Now they have reservations." },
  { value: "follow_up", label: "Follow-up", blurb: "You spoke before. Nothing was decided." },
];

const REP_NAME_KEY = "coldcall-trainer:rep-name";

export default function CallSetup({ personas }: { personas: Persona[] }) {
  const router = useRouter();
  const [repName, setRepName] = useState("");
  const [callType, setCallType] = useState<CallType>("cold_call");
  const [personaId, setPersonaId] = useState(personas[0]?.id ?? "");
  const [bargeIn, setBargeIn] = useState(false);

  // Remembering the rep saves retyping on every call; it is not authentication.
  useEffect(() => {
    const saved = localStorage.getItem(REP_NAME_KEY);
    if (saved) setRepName(saved);
  }, []);

  const eligible = personas.filter((p) => p.callTypes.includes(callType));
  const selected = eligible.find((p) => p.id === personaId) ?? eligible[0];

  useEffect(() => {
    if (selected && selected.id !== personaId) setPersonaId(selected.id);
  }, [selected, personaId]);

  const canStart = Boolean(repName.trim() && selected);

  function startCall() {
    if (!canStart || !selected) return;
    localStorage.setItem(REP_NAME_KEY, repName.trim());
    const params = new URLSearchParams({
      persona: selected.id,
      type: callType,
      rep: repName.trim(),
      bargeIn: String(bargeIn),
    });
    router.push(`/training/call?${params.toString()}`);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <div className="space-y-6">
        <section className="panel p-5">
          <label className="label" htmlFor="rep-name">
            Who's practising?
          </label>
          <input
            id="rep-name"
            className="field max-w-sm"
            placeholder="Your name"
            value={repName}
            onChange={(e) => setRepName(e.target.value)}
          />
          <p className="mt-2 text-xs text-muted">
            Used to track your scores over time on the history page.
          </p>
        </section>

        <section className="panel p-5">
          <span className="label">Call type</span>
          <div className="grid gap-2 sm:grid-cols-2">
            {CALL_TYPES.map((type) => (
              <button
                key={type.value}
                type="button"
                onClick={() => setCallType(type.value)}
                className={`rounded-lg border p-3 text-left transition-colors ${
                  callType === type.value
                    ? "border-accent bg-accent/10"
                    : "border-edge hover:border-slate-600"
                }`}
              >
                <div className="text-sm font-medium">{type.label}</div>
                <div className="mt-0.5 text-xs text-muted">{type.blurb}</div>
              </button>
            ))}
          </div>
        </section>

        <section className="panel p-5">
          <span className="label">Prospect</span>
          {eligible.length === 0 ? (
            <p className="text-sm text-muted">
              No prospects are set up for this call type yet.
            </p>
          ) : (
            <div className="space-y-2">
              {eligible.map((persona) => (
                <button
                  key={persona.id}
                  type="button"
                  onClick={() => setPersonaId(persona.id)}
                  className={`flex w-full items-start justify-between gap-4 rounded-lg border p-3 text-left transition-colors ${
                    selected?.id === persona.id
                      ? "border-accent bg-accent/10"
                      : "border-edge hover:border-slate-600"
                  }`}
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{persona.name}</div>
                    <div className="truncate text-xs text-muted">
                      {persona.title} · {persona.company}
                    </div>
                  </div>
                  <DifficultyDots value={persona.difficulty} />
                </button>
              ))}
            </div>
          )}
        </section>
      </div>

      <aside className="space-y-4">
        {selected && (
          <div className="panel p-5">
            <div className="text-sm font-semibold">{selected.name}</div>
            <div className="text-xs text-muted">
              {selected.title} · {selected.company}
            </div>
            <div className="mt-3 flex items-center gap-2">
              <DifficultyDots value={selected.difficulty} />
              <span className="text-xs text-muted">
                {DIFFICULTY_LABELS[selected.difficulty]}
              </span>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-slate-400">{selected.mood}</p>
            {selected.objections.length > 0 && (
              <div className="mt-4">
                <div className="label">Expect pushback like</div>
                <ul className="space-y-1 text-xs text-slate-400">
                  {selected.objections.slice(0, 3).map((o) => (
                    <li key={o}>“{o}”</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <div className="panel p-5">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={bargeIn}
              onChange={(e) => setBargeIn(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-[#4da3ff]"
            />
            <span>
              <span className="block text-sm font-medium">Allow interruptions</span>
              <span className="mt-1 block text-xs text-muted">
                Keeps the mic live so you can talk over the prospect.{" "}
                <strong className="text-amber-300">Headphones required</strong> — on speakers
                the mic will transcribe the prospect's own voice.
              </span>
            </span>
          </label>
        </div>

        <button className="btn-primary w-full" disabled={!canStart} onClick={startCall}>
          Dial {selected ? selected.name.split(" ")[0] : ""}
        </button>
      </aside>
    </div>
  );
}
