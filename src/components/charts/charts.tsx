"use client";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { formatMonth, formatQty, formatYen, formatYenCompact } from "@/lib/format";

const AXIS = { fontSize: 11, fill: "#71717a" };
const GRID = "#f0f0f1";

function Box({ children, height = 220, label }: { children: React.ReactElement; height?: number; label: string }) {
  return (
    <div style={{ height }} role="img" aria-label={label}>
      <ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer>
    </div>
  );
}

function TooltipBox({ title, rows }: { title: string; rows: { label: string; value: string; color?: string }[] }) {
  return (
    <div className="rounded-md border bg-card px-3 py-2 text-xs shadow-md">
      <div className="mb-1 font-medium">{title}</div>
      {rows.map((r) => (
        <div key={r.label} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            {r.color && <span className="size-2 rounded-full" style={{ background: r.color }} />}
            {r.label}
          </span>
          <span className="tabular font-medium">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

/** 在庫推移（日ごと）。発注点を点線で示す */
export function StockTrendChart({ data, unit, reorderPoint }: { data: { date: string; qty: number }[]; unit: string; reorderPoint: number }) {
  return (
    <Box label="在庫推移" height={240}>
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="date" tick={AXIS} tickLine={false} axisLine={false} minTickGap={40} tickFormatter={(d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8))}`} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} width={40} allowDecimals={false} />
        <ReferenceLine y={reorderPoint} stroke="#d97706" strokeDasharray="4 4" label={{ value: "発注点", position: "insideTopRight", fontSize: 11, fill: "#b45309" }} />
        <Tooltip content={({ active, payload, label }) => active && payload?.length ? (
          <TooltipBox title={String(label)} rows={[{ label: "在庫", value: formatQty(Number(payload[0].value), unit) }]} />
        ) : null} />
        <Area type="stepAfter" dataKey="qty" stroke="var(--chart-1)" strokeWidth={2} fill="var(--chart-1)" fillOpacity={0.08} isAnimationActive={false} />
      </AreaChart>
    </Box>
  );
}

/** 月別の入庫・出庫（金額。単位の違う数量を足さないため、仕入単価で金額にしている） */
export function InOutChart({ data, height }: { data: { month: string; inAmount: number; outAmount: number }[]; height?: number }) {
  return (
    <>
    <div className="mb-1 flex justify-end gap-3 text-xs text-muted-foreground" aria-hidden>
      <span className="flex items-center gap-1"><span className="size-2 rounded-sm" style={{ background: "var(--chart-1)" }} />入庫</span>
      <span className="flex items-center gap-1"><span className="size-2 rounded-sm" style={{ background: "var(--chart-2)" }} />出庫</span>
    </div>
    <Box label="月別入出庫（金額）" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barGap={2}>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="month" tick={AXIS} tickLine={false} axisLine={false} tickFormatter={(m: string) => formatMonth(m)} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} width={56} tickFormatter={formatYenCompact} />
        <Tooltip cursor={{ fill: "#f4f4f5" }} content={({ active, payload, label }) => active && payload?.length ? (
          <TooltipBox title={formatMonth(String(label), true)} rows={[
            { label: "入庫", value: formatYen(Number(payload[0]?.value)), color: "var(--chart-1)" },
            { label: "出庫", value: formatYen(Number(payload[1]?.value)), color: "var(--chart-2)" },
          ]} />
        ) : null} />
        <Bar dataKey="inAmount" name="入庫" fill="var(--chart-1)" radius={[2, 2, 0, 0]} maxBarSize={22} isAnimationActive={false} />
        <Bar dataKey="outAmount" name="出庫" fill="var(--chart-2)" radius={[2, 2, 0, 0]} maxBarSize={22} isAnimationActive={false} />
      </BarChart>
    </Box>
    </>
  );
}

/** 金額の推移（在庫金額・発注金額） */
export function AmountLineChart({ data, label, height }: { data: { month: string; amount: number }[]; label: string; height?: number }) {
  return (
    <Box label={label} height={height}>
      <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="month" tick={AXIS} tickLine={false} axisLine={false} tickFormatter={(m: string) => formatMonth(m)} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} width={56} tickFormatter={formatYenCompact} />
        <Tooltip content={({ active, payload, label: l }) => active && payload?.length ? (
          <TooltipBox title={formatMonth(String(l), true)} rows={[{ label, value: formatYen(Number(payload[0].value)) }]} />
        ) : null} />
        <Line dataKey="amount" stroke="var(--chart-1)" strokeWidth={2} dot={{ r: 3, fill: "var(--chart-1)" }} isAnimationActive={false} />
      </LineChart>
    </Box>
  );
}

/** 件数の推移（在庫不足の件数など） */
export function CountBarChart({ data, label, height, color = "var(--chart-1)" }: { data: { month: string; count: number }[]; label: string; height?: number; color?: string }) {
  return (
    <Box label={label} height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="month" tick={AXIS} tickLine={false} axisLine={false} tickFormatter={(m: string) => formatMonth(m)} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} width={32} allowDecimals={false} />
        <Tooltip cursor={{ fill: "#f4f4f5" }} content={({ active, payload, label: l }) => active && payload?.length ? (
          <TooltipBox title={formatMonth(String(l), true)} rows={[{ label, value: `${payload[0].value}件` }]} />
        ) : null} />
        <Bar dataKey="count" fill={color} radius={[2, 2, 0, 0]} maxBarSize={28} isAnimationActive={false} />
      </BarChart>
    </Box>
  );
}
