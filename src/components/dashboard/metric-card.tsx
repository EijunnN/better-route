import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { type Segment, Sparkline } from "./charts";

/** Per-card accent — a soft chip background + matching foreground. */
export interface Accent {
  soft: string;
  text: string;
}

export const ACCENTS = {
  lime: { soft: "bg-primary/10", text: "text-primary" },
  blue: { soft: "bg-chart-2/15", text: "text-chart-2" },
  green: { soft: "bg-chart-3/15", text: "text-chart-3" },
  violet: { soft: "bg-chart-4/15", text: "text-chart-4" },
  amber: { soft: "bg-chart-5/15", text: "text-chart-5" },
} as const satisfies Record<string, Accent>;

export interface Trend {
  /** Signed percentage change vs the previous period. */
  value: number;
  /** Context label, e.g. "vs. semana previa". */
  label: string;
}

function TrendPill({ trend }: { trend: Trend }) {
  const up = trend.value > 0;
  const flat = trend.value === 0;
  const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight;
  const tone = flat
    ? "text-muted-foreground"
    : up
      ? "text-chart-3"
      : "text-destructive";
  return (
    <span className="mt-1 flex items-center gap-1 text-xs">
      <span className={`flex items-center gap-0.5 font-medium ${tone}`}>
        <Icon className="size-3" />
        {Math.abs(trend.value)}%
      </span>
      <span className="text-muted-foreground">{trend.label}</span>
    </span>
  );
}

export interface MetricCardProps {
  title: string;
  value: string | number;
  icon: React.ElementType;
  accent: Accent;
  /** Real per-day series (sparkline). Mutually exclusive with `segments`. */
  sparkline?: number[];
  trend?: Trend;
  /** Status breakdown (segment bar) when there's no honest time series. */
  segments?: Segment[];
  footer?: string;
}

export function MetricCard({
  title,
  value,
  icon: Icon,
  accent,
  sparkline,
  trend,
  segments,
  footer,
}: MetricCardProps) {
  return (
    <Card className="relative overflow-hidden transition-colors hover:border-border/80">
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <span className="font-medium text-muted-foreground text-sm">
            {title}
          </span>
          <div className={`rounded-lg p-1.5 ${accent.soft}`}>
            <Icon className={`size-4 ${accent.text}`} />
          </div>
        </div>

        <div className="mt-3 flex items-end justify-between gap-3">
          <div className="min-w-0">
            <div className="font-bold text-3xl tracking-tight tabular-nums">
              {value}
            </div>
            {trend && <TrendPill trend={trend} />}
          </div>
          {sparkline && sparkline.length > 1 && (
            <div className={`h-9 w-24 shrink-0 ${accent.text}`}>
              <Sparkline data={sparkline} className="h-full w-full" />
            </div>
          )}
        </div>

        {segments && (
          <div className="mt-4 space-y-2">
            <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
              {segments.reduce((s, x) => s + x.value, 0) > 0 &&
                segments.map((s) =>
                  s.value > 0 ? (
                    <div
                      key={s.label}
                      className={s.color}
                      style={{
                        width: `${(s.value / segments.reduce((a, b) => a + b.value, 0)) * 100}%`,
                      }}
                      title={`${s.label}: ${s.value}`}
                    />
                  ) : null,
                )}
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-0.5">
              {segments
                .filter((s) => s.value > 0)
                .slice(0, 3)
                .map((s) => (
                  <span
                    key={s.label}
                    className="flex items-center gap-1 text-[11px] text-muted-foreground"
                  >
                    <span className={`size-1.5 rounded-full ${s.color}`} />
                    {s.label}
                  </span>
                ))}
            </div>
          </div>
        )}

        {footer && (
          <p className="mt-2 text-muted-foreground text-xs">{footer}</p>
        )}
      </CardContent>
    </Card>
  );
}
