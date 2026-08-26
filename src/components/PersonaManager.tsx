"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  DIFFICULTY_LABELS,
  type CallType,
  type Difficulty,
  type Persona,
} from "@/lib/types";
import DifficultyDots from "./DifficultyDots";

const ALL_CALL_TYPES: { value: CallType; label: string }[] = [
  { value: "cold_call", label: "Cold call" },
  { value: "discovery", label: "Discovery" },
  { value: "closing", label: "Closing" },
  { value: "follow_up", label: "Follow-up" },
];

interface DraftPersona {
  name: string;
  title: string;
  company: string;
  industry: string;
  difficulty: Difficulty;
  mood: string;
  personality: string;
  objections: string;
  winCondition: string;
  callTypes: CallType[];
  voiceHint: "male" | "female" | "neutral";
}

const EMPTY_DRAFT: DraftPersona = {
  name: "",
  title: "",
  company: "",
  industry: "",
  difficulty: 3,
  mood: "",
  personality: "",
  objections: "",
  winCondition: "",
  callTypes: ["cold_call"],
  voiceHint: "neutral",
};

export default function PersonaManager({ initial }: { initial: Persona[] }) {
  const router = useRouter();
  const [personas, setPersonas] = useState(initial);
  const [draft, setDraft] = useState<DraftPersona>(EMPTY_DRAFT);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSave = Boolean(
    draft.name.trim() && draft.title.trim() && draft.company.trim() && draft.industry.trim(),
  );

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/personas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...draft,
          objections: draft.objections
            .split("\n")
            .map((o) => o.trim())
            .filter(Boolean),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not save the prospect.");

      setPersonas((prev) =>
        [...prev, data.persona as Persona].sort(
          (a, b) => a.difficulty - b.difficulty || a.name.localeCompare(b.name),
        ),
      );
      setDraft(EMPTY_DRAFT);
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the prospect.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setError(null);
    const res = await fetch(`/api/personas/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const detail = await res.json().catch(() => null);
      setError(detail?.error ?? "Could not delete the prospect.");
      return;
    }
    setPersonas((prev) => prev.filter((p) => p.id !== id));
    router.refresh();
  }

  function toggleCallType(type: CallType) {
    setDraft((d) => ({
      ...d,
      callTypes: d.callTypes.includes(type)
        ? d.callTypes.filter((t) => t !== type)
        : [...d.callTypes, type],
    }));
  }

  return (
    <div className="space-y-5">
      {error && (
        <div className="panel border-bad/40 bg-bad/10 p-4 text-sm text-red-300">{error}</div>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {personas.map((persona) => (
          <div key={persona.id} className="panel p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold">{persona.name}</div>
                <div className="truncate text-xs text-muted">
                  {persona.title} · {persona.company}
                </div>
              </div>
              <DifficultyDots value={persona.difficulty} />
            </div>

            <p className="mt-3 text-xs leading-relaxed text-slate-400">{persona.mood}</p>

            <div className="mt-3 flex flex-wrap gap-1.5">
              {persona.callTypes.map((t) => (
                <span key={t} className="rounded-full bg-edge px-2 py-0.5 text-[11px] text-slate-400">
                  {t.replace("_", " ")}
                </span>
              ))}
            </div>

            <div className="mt-4 flex items-center justify-between border-t border-edge pt-3">
              <span className="text-[11px] text-muted">
                {DIFFICULTY_LABELS[persona.difficulty]}
              </span>
              {persona.builtIn ? (
                <span className="text-[11px] text-muted">Built in</span>
              ) : (
                <button
                  className="text-[11px] text-red-400 hover:text-red-300"
                  onClick={() => void remove(persona.id)}
                >
                  Delete
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {!open ? (
        <button className="btn-ghost" onClick={() => setOpen(true)}>
          + Add a prospect
        </button>
      ) : (
        <div className="panel space-y-4 p-5">
          <div className="text-sm font-semibold">New prospect</div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" value={draft.name} onChange={(v) => setDraft({ ...draft, name: v })} placeholder="Sam Okonkwo" />
            <Field label="Job title" value={draft.title} onChange={(v) => setDraft({ ...draft, title: v })} placeholder="Director of Procurement" />
            <Field label="Company" value={draft.company} onChange={(v) => setDraft({ ...draft, company: v })} placeholder="Vantage Retail" />
            <Field label="Industry" value={draft.industry} onChange={(v) => setDraft({ ...draft, industry: v })} placeholder="Retail" />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="difficulty">
                Difficulty — {DIFFICULTY_LABELS[draft.difficulty]}
              </label>
              <input
                id="difficulty"
                type="range"
                min={1}
                max={5}
                value={draft.difficulty}
                onChange={(e) =>
                  setDraft({ ...draft, difficulty: Number(e.target.value) as Difficulty })
                }
                className="w-full accent-[#4da3ff]"
              />
            </div>
            <div>
              <label className="label" htmlFor="voice">
                Voice
              </label>
              <select
                id="voice"
                className="field"
                value={draft.voiceHint}
                onChange={(e) =>
                  setDraft({ ...draft, voiceHint: e.target.value as DraftPersona["voiceHint"] })
                }
              >
                <option value="neutral">Default</option>
                <option value="female">Female</option>
                <option value="male">Male</option>
              </select>
            </div>
          </div>

          <Field
            label="Mood at pickup"
            value={draft.mood}
            onChange={(v) => setDraft({ ...draft, mood: v })}
            placeholder="Distracted, eating lunch at their desk"
          />

          <TextArea
            label="Personality"
            hint="How they talk, what irritates them, what they respect."
            rows={4}
            value={draft.personality}
            onChange={(v) => setDraft({ ...draft, personality: v })}
            placeholder="Speaks slowly and deliberately. Hates being rushed…"
          />

          <TextArea
            label="Objections"
            hint="One per line."
            rows={4}
            value={draft.objections}
            onChange={(v) => setDraft({ ...draft, objections: v })}
            placeholder={"We're happy with our current supplier\nEverything goes through RFP"}
          />

          <TextArea
            label="What wins them over"
            hint="The bar the rep has to clear to earn a meeting."
            rows={3}
            value={draft.winCondition}
            onChange={(v) => setDraft({ ...draft, winCondition: v })}
            placeholder="A specific, credible cost saving with a named comparable customer."
          />

          <div>
            <span className="label">Use for</span>
            <div className="flex flex-wrap gap-2">
              {ALL_CALL_TYPES.map((type) => (
                <button
                  key={type.value}
                  type="button"
                  onClick={() => toggleCallType(type.value)}
                  className={`rounded-lg border px-3 py-1.5 text-xs transition-colors ${
                    draft.callTypes.includes(type.value)
                      ? "border-accent bg-accent/10 text-white"
                      : "border-edge text-slate-400 hover:border-slate-600"
                  }`}
                >
                  {type.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3 border-t border-edge pt-4">
            <button
              className="btn-primary"
              disabled={!canSave || busy || draft.callTypes.length === 0}
              onClick={() => void create()}
            >
              {busy ? "Saving…" : "Save prospect"}
            </button>
            <button
              className="btn-ghost"
              onClick={() => {
                setOpen(false);
                setDraft(EMPTY_DRAFT);
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="label">{label}</label>
      <input
        className="field"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function TextArea({
  label,
  hint,
  rows,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  hint?: string;
  rows: number;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="label">{label}</label>
      <textarea
        className="field resize-y"
        rows={rows}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
      {hint && <p className="mt-1.5 text-xs text-muted">{hint}</p>}
    </div>
  );
}
