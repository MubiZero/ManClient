"use client";

import { Area, AreaChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type SeriesPoint = Record<string, string | number>;

const gridColor = "var(--color-border)";
const axisColor = "var(--color-muted-foreground)";

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
      <p className="mb-1 font-medium">{label}</p>
      {payload.map((entry) => (
        <p key={entry.name} className="flex items-center gap-1.5">
          <span className="size-2 rounded-full" style={{ background: entry.color }} aria-hidden />
          {entry.name}: {entry.value.toLocaleString("ru-RU")}
        </p>
      ))}
    </div>
  );
}

export function TrendAreaChart({ data, dataKey, xKey = "label" }: { data: SeriesPoint[]; dataKey: string; xKey?: string }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <defs>
          <linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--color-primary)" stopOpacity={0.35} />
            <stop offset="95%" stopColor="var(--color-primary)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke={gridColor} />
        <XAxis dataKey={xKey} stroke={axisColor} fontSize={12} tickLine={false} axisLine={false} />
        <YAxis stroke={axisColor} fontSize={12} tickLine={false} axisLine={false} width={36} />
        <Tooltip content={<ChartTooltip />} />
        <Area type="monotone" dataKey={dataKey} stroke="var(--color-primary)" strokeWidth={2} fill="url(#trend-fill)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function MultiLineChart({ data, lines, xKey = "label" }: { data: SeriesPoint[]; lines: Array<{ key: string; color: string; name: string }>; xKey?: string }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={gridColor} />
        <XAxis dataKey={xKey} stroke={axisColor} fontSize={12} tickLine={false} axisLine={false} />
        <YAxis stroke={axisColor} fontSize={12} tickLine={false} axisLine={false} width={36} />
        <Tooltip content={<ChartTooltip />} />
        {lines.map((line) => (
          <Line key={line.key} type="monotone" dataKey={line.key} name={line.name} stroke={line.color} strokeWidth={2} dot={false} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
