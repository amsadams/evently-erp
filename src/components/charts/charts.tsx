"use client";
import * as React from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { moneyCompact } from "@/lib/formatting";

export const CHART_COLORS = ["#6D4AFF", "#0F9D8A", "#D98A1F", "#2167C8", "#C4364F", "#94A3B8", "#A21CAF", "#4D7C0F"];
const axis = { fontSize: 11, fill: "#687085" };

interface Series { key: string; label: string; color?: string }

export function MoneyBarChart({ data, series, xKey = "name", height = 240, stacked }: { data: Record<string, number | string>[]; series: Series[]; xKey?: string; height?: number; stacked?: boolean }) {
  if (!data.length) return <p className="py-10 text-center text-xs text-muted">No data for this period.</p>;
  return (
    <div role="img" aria-label={`Bar chart: ${series.map((s) => s.label).join(", ")}`} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 4, left: -8, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="#E5E8F0" />
          <XAxis dataKey={xKey} tick={axis} tickLine={false} axisLine={false} />
          <YAxis tick={axis} tickLine={false} axisLine={false} tickFormatter={(v) => moneyCompact(Number(v))} width={52} />
          <Tooltip cursor={{ fill: "#F1F3F9" }} formatter={(v) => moneyCompact(Number(v))} contentStyle={{ borderRadius: 8, border: "1px solid #E5E8F0", fontSize: 12 }} />
          {series.length > 1 && <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />}
          {series.map((s, i) => <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color ?? CHART_COLORS[i]} radius={stacked ? 0 : [4, 4, 0, 0]} stackId={stacked ? "a" : undefined} maxBarSize={36} />)}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function MoneyAreaChart({ data, series, xKey = "name", height = 240 }: { data: Record<string, number | string>[]; series: Series[]; xKey?: string; height?: number }) {
  if (!data.length) return <p className="py-10 text-center text-xs text-muted">No data for this period.</p>;
  return (
    <div role="img" aria-label={`Area chart: ${series.map((s) => s.label).join(", ")}`} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 4, left: -8, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="#E5E8F0" />
          <XAxis dataKey={xKey} tick={axis} tickLine={false} axisLine={false} />
          <YAxis tick={axis} tickLine={false} axisLine={false} tickFormatter={(v) => moneyCompact(Number(v))} width={52} />
          <Tooltip formatter={(v) => moneyCompact(Number(v))} contentStyle={{ borderRadius: 8, border: "1px solid #E5E8F0", fontSize: 12 }} />
          <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
          {series.map((s, i) => <Area key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color ?? CHART_COLORS[i]} fill={s.color ?? CHART_COLORS[i]} fillOpacity={0.12} strokeWidth={2} />)}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CountBarChart({ data, height = 220, layout = "vertical" }: { data: { name: string; value: number }[]; height?: number; layout?: "vertical" | "horizontal" }) {
  if (!data.length) return <p className="py-10 text-center text-xs text-muted">No data for this period.</p>;
  const horizontal = layout === "horizontal";
  return (
    <div role="img" aria-label="Bar chart of counts" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout={horizontal ? "vertical" : "horizontal"} margin={{ top: 4, right: 12, left: horizontal ? 24 : -20, bottom: 0 }}>
          <CartesianGrid horizontal={!horizontal} vertical={horizontal} stroke="#E5E8F0" />
          {horizontal ? <><XAxis type="number" tick={axis} tickLine={false} axisLine={false} allowDecimals={false} /><YAxis type="category" dataKey="name" tick={axis} tickLine={false} axisLine={false} width={92} /></>
            : <><XAxis dataKey="name" tick={axis} tickLine={false} axisLine={false} interval={0} /><YAxis tick={axis} tickLine={false} axisLine={false} allowDecimals={false} /></>}
          <Tooltip cursor={{ fill: "#F1F3F9" }} contentStyle={{ borderRadius: 8, border: "1px solid #E5E8F0", fontSize: 12 }} />
          <Bar dataKey="value" name="Count" radius={4} maxBarSize={28} fill="#6D4AFF">
            {data.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function Donut({ data, height = 200, money }: { data: { name: string; value: number }[]; height?: number; money?: boolean }) {
  const total = data.reduce((a, d) => a + d.value, 0);
  if (!total) return <p className="py-10 text-center text-xs text-muted">No data for this period.</p>;
  return (
    <div className="flex items-center gap-4" role="img" aria-label="Donut chart breakdown">
      <div style={{ height, width: height }} className="shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="92%" paddingAngle={2} stroke="none">
              {data.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
            </Pie>
            <Tooltip formatter={(v) => (money ? moneyCompact(Number(v)) : String(v))} contentStyle={{ borderRadius: 8, border: "1px solid #E5E8F0", fontSize: 12 }} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="min-w-0 flex-1 space-y-1.5 text-xs">
        {data.map((d, i) => (
          <li key={d.name} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
            <span className="min-w-0 flex-1 truncate">{d.name}</span>
            <span className="font-medium tabular-nums">{money ? moneyCompact(d.value) : d.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
