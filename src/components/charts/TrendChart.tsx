"use client";

import { useMemo, useRef, useState } from "react";
import { money, number, shortDate } from "@/lib/format";
import type { TrendPoint } from "@/lib/types";

type Measure = "activities" | "revenueCents" | "points";

const MEASURES: { key: Measure; label: string }[] = [
  { key: "activities", label: "Activity" },
  { key: "revenueCents", label: "Revenue" },
  { key: "points", label: "Points" },
];

const W = 720;
const H = 220;
const PAD = { top: 16, right: 16, bottom: 26, left: 48 };

/**
 * Thirty days of one measure. One measure at a time, deliberately — activity
 * counts and revenue don't share a scale, and putting them on two y-axes would
 * invent a crossover that isn't in the data.
 */
export default function TrendChart({ data }: { data: TrendPoint[] }) {
  const [measure, setMeasure] = useState<Measure>("activities");
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const format = (v: number) =>
    measure === "revenueCents" ? money(v, { compact: true }) : number(v);

  const { points, path, area, max, plotW, plotH } = useMemo(() => {
    const plotW = W - PAD.left - PAD.right;
    const plotH = H - PAD.top - PAD.bottom;
    const values = data.map((d) => d[measure]);
    const max = Math.max(1, ...values);

    const points = data.map((d, i) => ({
      x: PAD.left + (data.length === 1 ? plotW / 2 : (i / (data.length - 1)) * plotW),
      y: PAD.top + plotH - (d[measure] / max) * plotH,
      value: d[measure],
      date: d.date,
    }));

    const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x} ${p.y}`).join(" ");
    const area =
      points.length > 0
        ? `${path} L${points[points.length - 1].x} ${PAD.top + plotH} L${points[0].x} ${
            PAD.top + plotH
          } Z`
        : "";

    return { points, path, area, max, plotW, plotH };
  }, [data, measure]);

  const ticks = [0, 0.5, 1].map((f) => ({
    value: max * f,
    y: PAD.top + plotH - f * plotH,
  }));

  const active = hover !== null ? points[hover] : null;

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || points.length === 0) return;
    const x = ((e.clientX - rect.left) / rect.width) * W;
    let nearest = 0;
    for (let i = 1; i < points.length; i++) {
      if (Math.abs(points[i].x - x) < Math.abs(points[nearest].x - x)) nearest = i;
    }
    setHover(nearest);
  }

  const total = data.reduce((sum, d) => sum + d[measure], 0);

  return (
    <div className="panel p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-white">
            {MEASURES.find((m) => m.key === measure)?.label} — last 30 days
          </h2>
          <p className="mt-0.5 text-xs text-muted">{format(total)} in total</p>
        </div>
        <div className="segmented">
          {MEASURES.map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => setMeasure(m.key)}
              className={`segmented-item ${measure === m.key ? "segmented-item-active" : ""}`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div className="relative">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="w-full"
          role="img"
          aria-label={`${measure} over the last 30 days`}
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
        >
          {ticks.map((t) => (
            <g key={t.y}>
              <line
                x1={PAD.left}
                x2={W - PAD.right}
                y1={t.y}
                y2={t.y}
                stroke="#1e2733"
                strokeWidth={1}
              />
              <text x={PAD.left - 8} y={t.y + 4} textAnchor="end" fontSize={11} fill="#8b9bb0">
                {format(t.value)}
              </text>
            </g>
          ))}

          <path d={area} fill="#3987e5" fillOpacity={0.14} />
          <path d={path} fill="none" stroke="#3987e5" strokeWidth={2} strokeLinejoin="round" />

          {active && (
            <>
              <line
                x1={active.x}
                x2={active.x}
                y1={PAD.top}
                y2={PAD.top + plotH}
                stroke="#8b9bb0"
                strokeWidth={1}
                strokeDasharray="3 3"
              />
              {/* 2px surface ring keeps the marker legible over the line */}
              <circle cx={active.x} cy={active.y} r={5} fill="#3987e5" stroke="#121821" strokeWidth={2} />
            </>
          )}

          {points.length > 0 && (
            <>
              <text x={points[0].x} y={H - 8} fontSize={11} fill="#8b9bb0">
                {shortDate(points[0].date)}
              </text>
              <text
                x={points[points.length - 1].x}
                y={H - 8}
                fontSize={11}
                fill="#8b9bb0"
                textAnchor="end"
              >
                {shortDate(points[points.length - 1].date)}
              </text>
            </>
          )}
        </svg>

        {active && (
          <div
            className="viz-tooltip"
            style={{
              left: `${(active.x / W) * 100}%`,
              top: `${(active.y / H) * 100}%`,
              transform: "translate(-50%, -130%)",
            }}
          >
            <div className="font-medium text-white">{format(active.value)}</div>
            <div className="text-muted">{shortDate(active.date)}</div>
          </div>
        )}
      </div>
    </div>
  );
}
