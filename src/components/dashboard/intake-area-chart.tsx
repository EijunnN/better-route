"use client";

import {
  Area,
  EvilAreaChart,
  Grid,
  Tooltip,
  XAxis,
} from "@/registry/charts/area-chart";
import type { ChartConfig } from "@/registry/ui/chart";

/** Lime brand fill, light + dark gradient stops. */
const config = {
  pedidos: {
    label: "Pedidos",
    colors: { light: ["#65a30d"], dark: ["#c5f33a"] },
  },
} satisfies ChartConfig;

/**
 * The dashboard's headline chart — orders ingested over the trailing window,
 * rendered with EvilCharts' gradient area chart (recharts + motion).
 */
export function IntakeAreaChart({
  data,
}: {
  data: { label: string; value: number }[];
}) {
  const rows = data.map((d) => ({ day: d.label, pedidos: d.value }));
  return (
    <EvilAreaChart
      data={rows}
      config={config}
      className="h-56 w-full"
      xDataKey="day"
    >
      <Grid />
      <XAxis dataKey="day" />
      <Tooltip />
      <Area dataKey="pedidos" variant="gradient" />
    </EvilAreaChart>
  );
}
