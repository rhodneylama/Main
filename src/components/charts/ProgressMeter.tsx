import { percent } from "@/lib/format";

/**
 * A quota meter. A bar rather than a gauge — length is read more accurately
 * than angle, and it stacks in a tile without stealing height.
 */
export default function ProgressMeter({
  fraction,
  label,
  caption,
}: {
  fraction: number;
  label?: string;
  caption?: string;
}) {
  const clamped = Math.max(0, Math.min(1.5, fraction));
  const width = Math.min(100, clamped * 100);
  const tone =
    fraction >= 1 ? "bg-status-good" : fraction >= 0.7 ? "bg-status-warning" : "bg-series-1";

  return (
    <div>
      {label && (
        <div className="mb-1.5 flex items-baseline justify-between text-xs">
          <span className="text-muted">{label}</span>
          <span className="font-medium tabular-nums text-slate-200">{percent(fraction)}</span>
        </div>
      )}
      <div
        className="h-2 overflow-hidden rounded-full bg-edge"
        role="meter"
        aria-valuenow={Math.round(fraction * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label ?? "Progress"}
      >
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${width}%` }} />
      </div>
      {caption && <div className="mt-1.5 text-xs text-muted">{caption}</div>}
    </div>
  );
}
