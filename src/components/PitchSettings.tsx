"use client";

import { useState } from "react";
import type { ProductContext } from "@/lib/types";

const FIELDS: {
  key: keyof ProductContext;
  label: string;
  hint: string;
  placeholder: string;
  rows: number;
}[] = [
  {
    key: "product",
    label: "What you sell",
    hint: "Plain language, the way you'd say it on a call.",
    placeholder: "Route-planning software for mid-market delivery fleets…",
    rows: 3,
  },
  {
    key: "icp",
    label: "Who you sell to",
    hint: "Company size, industry, and the job title you're usually calling.",
    placeholder: "Ops directors at regional carriers running 50–500 vehicles…",
    rows: 3,
  },
  {
    key: "pitch",
    label: "The opener reps are trained on",
    hint: "Prospects will recognise a script — that's intentional.",
    placeholder: "Hi [name], I know I've caught you cold…",
    rows: 4,
  },
  {
    key: "proofPoints",
    label: "Proof points",
    hint: "Numbers, customer names, and results reps are allowed to cite.",
    placeholder: "Cut empty miles 18% at Fastlane in the first quarter…",
    rows: 4,
  },
  {
    key: "commonObjections",
    label: "Objections you actually hear",
    hint: "One per line. Prospects will prefer these over their generic ones.",
    placeholder: "We're locked into a contract until next year\nWe built something in-house",
    rows: 5,
  },
];

export default function PitchSettings({ initial }: { initial: ProductContext }) {
  const [ctx, setCtx] = useState<ProductContext>(initial);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setStatus("saving");
    setError(null);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(ctx),
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => null);
        throw new Error(detail?.error ?? "Could not save.");
      }
      setStatus("saved");
      setTimeout(() => setStatus("idle"), 2500);
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Could not save.");
    }
  }

  return (
    <div className="max-w-2xl space-y-5">
      {FIELDS.map((field) => (
        <div key={field.key} className="panel p-5">
          <label className="label" htmlFor={field.key}>
            {field.label}
          </label>
          <textarea
            id={field.key}
            className="field resize-y font-normal"
            rows={field.rows}
            placeholder={field.placeholder}
            value={ctx[field.key]}
            onChange={(e) => setCtx({ ...ctx, [field.key]: e.target.value })}
          />
          <p className="mt-2 text-xs text-muted">{field.hint}</p>
        </div>
      ))}

      <div className="flex items-center gap-3">
        <button className="btn-primary" onClick={() => void save()} disabled={status === "saving"}>
          {status === "saving" ? "Saving…" : "Save"}
        </button>
        {status === "saved" && <span className="text-xs text-good">Saved.</span>}
        {status === "error" && error && <span className="text-xs text-red-300">{error}</span>}
      </div>
    </div>
  );
}
