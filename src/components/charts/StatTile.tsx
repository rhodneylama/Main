import type { ReactNode } from "react";

/**
 * A single headline number. No plot, so no hover layer — the value is the whole
 * point, and a sublabel carries the comparison rather than a second axis.
 */
export default function StatTile({
  label,
  value,
  sublabel,
  accent,
  children,
}: {
  label: string;
  value: string;
  sublabel?: string;
  /** Tailwind text colour class for the value, e.g. "text-status-good". */
  accent?: string;
  children?: ReactNode;
}) {
  return (
    <div className="panel p-4">
      <div className="stat-label">{label}</div>
      <div className={`stat-value ${accent ?? ""}`}>{value}</div>
      {sublabel && <div className="mt-1 text-xs text-muted">{sublabel}</div>}
      {children}
    </div>
  );
}
