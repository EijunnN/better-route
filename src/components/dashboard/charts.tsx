/**
 * Dependency-free, server-rendered chart primitives for the dashboard.
 * Pure SVG/CSS — no client bundle, no charting library. Colour is driven by
 * `currentColor` (sparkline) or explicit `bg-*` classes (bars/segments), so
 * every primitive inherits the theme tokens and works in light + dark.
 */

/** Tiny inline SVG sparkline (filled area + line). Set the colour on a parent
 *  via `text-primary` / `text-chart-3` etc. */
export function Sparkline({
  data,
  className,
}: {
  data: number[];
  className?: string;
}) {
  const w = 100;
  const h = 32;
  if (data.length === 0) return null;
  const max = Math.max(...data, 1);
  const n = data.length;
  const px = (i: number) => (n === 1 ? w : (i / (n - 1)) * w);
  const py = (v: number) => h - (v / max) * (h - 3) - 2;
  const line = data
    .map((v, i) => `${px(i).toFixed(2)},${py(v).toFixed(2)}`)
    .join(" ");
  const area = `0,${h} ${line} ${w},${h}`;
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className={className}
      aria-hidden="true"
    >
      <polygon points={area} fill="currentColor" className="opacity-[0.12]" />
      <polyline
        points={line}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export interface BarDatum {
  label: string;
  value: number;
  /** Highlight this bar (e.g. today). */
  emphasis?: boolean;
}

export interface Segment {
  value: number;
  /** Tailwind `bg-*` class for the fill. */
  color: string;
  label: string;
}

/** Horizontal stacked segment bar (status distribution / utilisation). */
export function SegmentBar({
  segments,
  className,
}: {
  segments: Segment[];
  className?: string;
}) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  return (
    <div
      className={`flex h-2 w-full overflow-hidden rounded-full bg-muted ${className ?? ""}`}
    >
      {total > 0 &&
        segments.map((s) =>
          s.value > 0 ? (
            <div
              key={s.label}
              className={s.color}
              style={{ width: `${(s.value / total) * 100}%` }}
              title={`${s.label}: ${s.value}`}
            />
          ) : null,
        )}
    </div>
  );
}

/** A small coloured-dot + label + count legend row, used under segment bars. */
export function Legend({ segments }: { segments: Segment[] }) {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1">
      {segments
        .filter((s) => s.value > 0)
        .map((s) => (
          <span
            key={s.label}
            className="flex items-center gap-1.5 text-muted-foreground text-xs"
          >
            <span className={`size-2 rounded-full ${s.color}`} />
            {s.label}
            <span className="font-medium text-foreground tabular-nums">
              {s.value}
            </span>
          </span>
        ))}
    </div>
  );
}
