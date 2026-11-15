import React from 'react';
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell, ScatterChart, Scatter, ZAxis, ReferenceLine, ComposedChart, Legend as RLegend
} from 'recharts';
import { num } from '../lib/format.js';

export const PALETTE = ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)', 'var(--c5)', 'var(--c6)', 'var(--c7)'];
const axis = { stroke: 'var(--text-3)', fontSize: 11.5, tickLine: false, axisLine: false };
const grid = <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />;

function Tip({ active, payload, label, fmt = v => num(v, 1) }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      {label != null && <b>{label}</b>}
      {payload.filter(p => p.value != null).map(p => (
        <div key={p.dataKey}><i style={{ background: p.color || p.payload?.fill }} />{p.name} : <strong style={{ color: 'var(--text)' }}>{fmt(p.value)}</strong></div>
      ))}
    </div>
  );
}

export function Legend({ items }) {
  return <div className="legend">{items.map(([l, c]) => <span key={l}><i style={{ background: c }} />{l}</span>)}</div>;
}

/** Barres : series = [{ key, name, color? }] */
export function Bars({ data, x, series, height = 260, fmt, stacked, horizontal, colorBy, refLine }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout={horizontal ? 'vertical' : 'horizontal'} margin={{ top: 8, right: 12, left: horizontal ? 8 : -10, bottom: 0 }} barGap={3}>
        {horizontal ? <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" horizontal={false} /> : grid}
        {horizontal ? <><XAxis type="number" {...axis} tickFormatter={fmt} /><YAxis type="category" dataKey={x} {...axis} width={120} /></>
          : <><XAxis dataKey={x} {...axis} /><YAxis {...axis} tickFormatter={fmt} /></>}
        <Tooltip content={<Tip fmt={fmt} />} cursor={{ fill: 'var(--surface-3)', opacity: .6 }} />
        {refLine != null && <ReferenceLine {...(horizontal ? { x: refLine } : { y: refLine })} stroke="var(--danger)" strokeDasharray="4 4" />}
        {series.map((s, i) => (
          <Bar key={s.key} dataKey={s.key} name={s.name} stackId={stacked ? 'a' : undefined} fill={s.color || PALETTE[i]} radius={stacked ? 0 : horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]} maxBarSize={38}>
            {colorBy && data.map((d, j) => <Cell key={j} fill={colorBy(d)} />)}
          </Bar>
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function Lines({ data, x, series, height = 260, fmt, area }) {
  const Chart = area ? AreaChart : LineChart;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <Chart data={data} margin={{ top: 8, right: 12, left: -10, bottom: 0 }}>
        {grid}
        <XAxis dataKey={x} {...axis} />
        <YAxis {...axis} tickFormatter={fmt} />
        <Tooltip content={<Tip fmt={fmt} />} />
        {series.map((s, i) => area
          ? <Area key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.color || PALETTE[i]} fill={s.color || PALETTE[i]} fillOpacity={s.dashed ? 0 : .12} strokeWidth={2} strokeDasharray={s.dashed ? '5 4' : undefined} connectNulls={false} />
          : <Line key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.color || PALETTE[i]} strokeWidth={2.2} strokeDasharray={s.dashed ? '5 4' : undefined} dot={{ r: 3 }} connectNulls={false} />)}
      </Chart>
    </ResponsiveContainer>
  );
}

export function Combo({ data, x, bars = [], lines = [], height = 280, fmt }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 8, right: 12, left: -6, bottom: 0 }}>
        {grid}
        <XAxis dataKey={x} {...axis} />
        <YAxis {...axis} tickFormatter={fmt} />
        <Tooltip content={<Tip fmt={fmt} />} cursor={{ fill: 'var(--surface-3)', opacity: .6 }} />
        <RLegend wrapperStyle={{ fontSize: 12 }} iconType="circle" iconSize={8} />
        {bars.map((s, i) => <Bar key={s.key} dataKey={s.key} name={s.name} fill={s.color || PALETTE[i]} radius={[4, 4, 0, 0]} maxBarSize={30} />)}
        {lines.map((s, i) => <Line key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.color || PALETTE[i + bars.length]} strokeWidth={2.2} strokeDasharray={s.dashed ? '5 4' : undefined} dot={{ r: 3 }} />)}
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function Donut({ data, nameKey = 'name', valueKey = 'value', height = 220, colors = PALETTE, center }) {
  return (
    <div style={{ position: 'relative' }}>
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie data={data} dataKey={valueKey} nameKey={nameKey} innerRadius="62%" outerRadius="88%" paddingAngle={2} stroke="none">
            {data.map((_, i) => <Cell key={i} fill={colors[i % colors.length]} />)}
          </Pie>
          <Tooltip content={<Tip />} />
        </PieChart>
      </ResponsiveContainer>
      {center && <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none', textAlign: 'center' }}>{center}</div>}
    </div>
  );
}

export function Scatterplot({ data, x, y, xName, yName, height = 280 }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ScatterChart margin={{ top: 8, right: 16, left: -10, bottom: 4 }}>
        <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
        <XAxis type="number" dataKey={x} name={xName} {...axis} unit=" %" />
        <YAxis type="number" dataKey={y} name={yName} {...axis} domain={[0, 20]} />
        <ZAxis range={[36, 36]} />
        <ReferenceLine y={10} stroke="var(--danger)" strokeDasharray="4 4" />
        <Tooltip cursor={{ strokeDasharray: '3 3' }} content={({ active, payload }) => active && payload?.length ? (
          <div className="chart-tooltip"><b>{payload[0].payload.eleve}</b><div>{xName} : {num(payload[0].payload[x], 1)} %</div><div>{yName} : {num(payload[0].payload[y], 2)}</div></div>
        ) : null} />
        <Scatter data={data} fill="var(--c1)" fillOpacity={0.6} />
      </ScatterChart>
    </ResponsiveContainer>
  );
}
