"use client";

import { Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from "recharts";
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";

// Two small charts for the home page overview. Colours are the design system's chart
// tokens (identity per source kind, one hue for the ranked arms); text stays in text tokens.

import { KIND_ORDER, type KindKey } from "@/lib/overview";

const KIND_COLOR: Record<KindKey, string> = {
  stellungnahme: "var(--chart-1)",
  press: "var(--chart-3)",
  law: "var(--chart-4)",
  other: "var(--gray-alpha-400)",
};

export interface YearRow {
  year: number;
  stellungnahme: number;
  press: number;
  law: number;
  other: number;
}

export function SourcesByYear({
  rows,
  labels,
  title,
}: {
  rows: YearRow[];
  labels: Record<string, string>;
  title: string;
}) {
  const present = KIND_ORDER.filter((k) => rows.some((r) => r[k] > 0));
  const config = Object.fromEntries(
    present.map((k) => [k, { label: labels[k] ?? k, color: KIND_COLOR[k] }]),
  ) as ChartConfig;
  return (
    <ChartContainer
      config={config}
      className="aspect-auto h-44 w-full"
      role="img"
      aria-label={title}
    >
      <BarChart data={rows} margin={{ top: 4, right: 4, bottom: 0, left: 0 }} barCategoryGap={2}>
        <CartesianGrid vertical={false} strokeDasharray="2 4" />
        <XAxis
          dataKey="year"
          tickLine={false}
          axisLine={false}
          interval="preserveStartEnd"
          minTickGap={24}
          tickMargin={6}
        />
        <YAxis tickLine={false} axisLine={false} width={36} tickCount={4} />
        <ChartTooltip cursor={{ fillOpacity: 0.4 }} content={<ChartTooltipContent />} />
        <ChartLegend content={<ChartLegendContent />} />
        {present.map((k, i) => (
          <Bar
            key={k}
            dataKey={k}
            isAnimationActive={false}
            stackId="kinds"
            fill={`var(--color-${k})`}
            stroke="var(--card)"
            strokeWidth={1}
            radius={i === present.length - 1 ? [3, 3, 0, 0] : 0}
          />
        ))}
      </BarChart>
    </ChartContainer>
  );
}

export interface ArmRow {
  key: string;
  label: string;
  /** Stance direction agreement in percent. */
  value: number;
  highlight: boolean;
}

export function StanceArms({ rows, title }: { rows: ArmRow[]; title: string }) {
  const config = {
    value: { label: title, color: "var(--chart-1)" },
  } satisfies ChartConfig;
  return (
    <ChartContainer
      config={config}
      className="aspect-auto w-full"
      style={{ height: rows.length * 30 + 8 }}
      role="img"
      aria-label={title}
    >
      <BarChart
        data={rows}
        layout="vertical"
        margin={{ top: 0, right: 40, bottom: 0, left: 0 }}
        barCategoryGap={6}
      >
        <XAxis type="number" domain={[0, 100]} hide />
        <YAxis
          type="category"
          dataKey="label"
          width={176}
          tickLine={false}
          axisLine={false}
          interval={0}
        />
        <ChartTooltip
          cursor={{ fillOpacity: 0.4 }}
          content={<ChartTooltipContent formatter={(v) => `${v} %`} hideLabel />}
        />
        <Bar
          dataKey="value"
          fill="var(--color-value)"
          radius={[0, 3, 3, 0]}
          maxBarSize={14}
          isAnimationActive={false}
        >
          <LabelList
            dataKey="value"
            position="right"
            offset={8}
            className="fill-foreground"
            fontSize={12}
            formatter={(v: unknown) => `${String(v)} %`}
          />
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}
