"use client";

import { useRepIdentity, useRoster } from "@/lib/use-rep";

/**
 * The "who are you" control in the header. Points and training progress attach
 * to whoever is selected here.
 */
export default function RepPicker() {
  const { rep, loaded, choose } = useRepIdentity();
  const reps = useRoster();

  if (!loaded) return <div className="h-8 w-36 rounded-lg bg-edge/50" aria-hidden />;

  return (
    <label className="flex items-center gap-2">
      <span className="sr-only">Who are you?</span>
      <select
        className="rounded-lg border border-edge bg-panel px-2.5 py-1.5 text-sm text-slate-200
                   focus:border-accent focus:outline-none"
        value={rep?.id ?? ""}
        onChange={(e) => {
          const match = reps.find((r) => r.id === e.target.value);
          choose(match ? { id: match.id, name: match.name } : null);
        }}
      >
        <option value="">Who are you?</option>
        {reps.map((r) => (
          <option key={r.id} value={r.id}>
            {r.avatar} {r.name}
          </option>
        ))}
      </select>
    </label>
  );
}
