import { headers } from "next/headers";
import { getProductContext } from "@/lib/db";
import { publicGhlConfig } from "@/lib/ghl/config";
import { ensureSeeded } from "@/lib/seed-demo";
import { ACTIVITY_LABELS, DEFAULT_POINT_RULES, LEVELS } from "@/lib/points";
import { number } from "@/lib/format";
import PitchSettings from "@/components/PitchSettings";
import GhlSettings from "@/components/GhlSettings";
import type { ActivityType } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  ensureSeeded();

  const headerList = await headers();
  const host = headerList.get("host") ?? "localhost:3000";
  const proto = headerList.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted">
          Where the numbers come from, what they are worth, and what your reps are pitching.
        </p>
      </div>

      <GhlSettings config={publicGhlConfig()} webhookUrl={`${proto}://${host}/api/ghl/webhook`} />

      <div className="panel p-4">
        <h2 className="text-sm font-semibold text-white">Scoring</h2>
        <p className="mt-0.5 text-sm text-muted">
          What each activity is worth. Deals also earn 10 points per 1,000 of value, so a big close
          outranks a small one without swamping the board.
        </p>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {(Object.keys(DEFAULT_POINT_RULES) as ActivityType[]).map((type) => (
            <li
              key={type}
              className="flex items-center justify-between rounded-lg border border-edge/70 px-3 py-2 text-sm"
            >
              <span className="text-slate-300">{ACTIVITY_LABELS[type]}</span>
              <span className="tabular-nums text-white">{DEFAULT_POINT_RULES[type]} pts</span>
            </li>
          ))}
        </ul>

        <h3 className="mt-5 text-xs font-semibold uppercase tracking-wide text-muted">Levels</h3>
        <ul className="mt-2 flex flex-wrap gap-2">
          {LEVELS.map((level) => (
            <li key={level.level} className="chip">
              Lv{level.level} {level.name} · {number(level.minPoints)}
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold text-white">Your pitch</h2>
        <p className="mb-3 text-sm text-muted">
          Used by the AI prospects in training, so they push back on your real offer rather than a
          generic one.
        </p>
        <PitchSettings initial={getProductContext()} />
      </div>
    </div>
  );
}
