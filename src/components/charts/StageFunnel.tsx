"use client";

import { useState } from "react";
import { money, number } from "@/lib/format";
import type { StageBreakdown } from "@/lib/types";

/** Ordinal ramp, light to dark down the funnel. Never steps darker than 2:1. */
const RAMP = ["#b7d3f6", "#86b6ef", "#3987e5", "#256abf", "#184f95"];

/**
 * Open pipeline by stage. Horizontal bars because stage names are words, and
 * length compares more accurately than the wedges of a classic funnel shape.
 */
export default function StageFunnel({ stages }: { stages: StageBreakdown[] }) {
  const [hover, setHover] = useState<string | null>(null);
  const max = Math.max(1, ...stages.map((s) => s.valueCents));
  const total = stages.reduce((sum, s) => sum + s.valueCents, 0);

  if (stages.length === 0) {
    return (
      <div className="panel p-4">
        <h2 className="text-sm font-semibold text-white">Open pipeline by stage</h2>
        <p className="mt-3 text-sm text-muted">
          No open deals yet. Sync GoHighLevel or log a deal to fill this in.
        </p>
      </div>
    );
  }

  return (
    <div className="panel p-4">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold text-white">Open pipeline by stage</h2>
        <span className="text-xs text-muted">{money(total, { compact: true })} open</span>
      </div>

      <div className="space-y-3">
        {stages.map((stage, i) => {
          const width = (stage.valueCents / max) * 100;
          const color = RAMP[Math.min(i, RAMP.length - 1)];
          return (
            <div
              key={stage.stageName}
              className="relative"
              onMouseEnter={() => setHover(stage.stageName)}
              onMouseLeave={() => setHover(null)}
            >
              <div className="mb-1 flex items-baseline justify-between text-xs">
                <span className="text-slate-300">{stage.stageName}</span>
                <span className="tabular-nums text-muted">
                  {number(stage.deals)} · {money(stage.valueCents, { compact: true })}
                </span>
              </div>
              {/* Bars sit on a shared baseline with a 2px surface gap between them. */}
              <div className="h-5 rounded bg-edge/60">
                <div
                  className="h-full rounded transition-[width] duration-300"
                  style={{ width: `${Math.max(2, width)}%`, backgroundColor: color }}
                />
              </div>

              {hover === stage.stageName && (
                <div className="viz-tooltip left-0 top-full mt-1">
                  <div className="font-medium text-white">{stage.stageName}</div>
                  <div className="text-muted">
                    {number(stage.deals)} open · {money(stage.valueCents)}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
