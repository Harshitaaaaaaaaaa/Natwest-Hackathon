import React from 'react';
import type { SuggestedVisual, MetricPoint } from '../../types';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Cell, CartesianGrid, PieChart, Pie,
  ScatterChart, Scatter, ZAxis, ReferenceLine,
} from 'recharts';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface ChartRendererProps {
  visual: SuggestedVisual;
  data: MetricPoint[];
  compact?: boolean;
}

const COLORS = ['#3b82f6', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#ec4899'];
const fmt = (val: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(val);
const fmtShort = (val: number) => {
  if (Math.abs(val) >= 1000) return `${(val / 1000).toFixed(1)}k`;
  return String(val);
};

const TOOLTIP_STYLE = {
  borderRadius: 12,
  boxShadow: '0 4px 24px rgba(31,38,135,0.12)',
  border: 'none',
  fontSize: 12,
  background: 'rgba(255,255,255,0.97)',
};

const AXIS_TICK = { fill: '#94a3b8', fontSize: 11 };

const chartWrapper = (children: React.ReactNode, height = 200) => (
  <div className="w-full mt-3 fade-in" style={{ height, animationDelay: '200ms' }}>
    <ResponsiveContainer width="100%" height="100%">
      {children as any}
    </ResponsiveContainer>
  </div>
);

export const ChartRenderer: React.FC<ChartRendererProps> = ({ visual, data, compact }) => {
  if (!data || data.length === 0) return null;
  const h = compact ? 150 : 200;

  switch (visual) {

    // ============================================================
    // LINE / SPARKLINE
    // ============================================================
    case 'Line':
    case 'Sparkline':
      return chartWrapper(
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f040" />
          <XAxis dataKey="label" axisLine={false} tickLine={false} tick={AXIS_TICK} />
          <YAxis axisLine={false} tickLine={false} tick={AXIS_TICK} width={42} tickFormatter={fmtShort} />
          <Tooltip formatter={(v: any) => [fmt(v), 'Value']} contentStyle={TOOLTIP_STYLE} />
          <Line
            type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={2.5}
            dot={{ r: 4, strokeWidth: 0, fill: '#3b82f6' }}
            activeDot={{ r: 6, fill: '#2563eb' }}
          />
        </LineChart>,
        h,
      );

    // ============================================================
    // BAR (standard grouped)
    // ============================================================
    case 'Bar':
      return chartWrapper(
        <BarChart data={data} barCategoryGap="30%">
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f040" />
          <XAxis dataKey="label" axisLine={false} tickLine={false} tick={AXIS_TICK} />
          <YAxis axisLine={false} tickLine={false} tick={AXIS_TICK} width={42} tickFormatter={fmtShort} />
          <Tooltip formatter={(v: any) => [fmt(v), 'Value']} contentStyle={TOOLTIP_STYLE} />
          <Bar dataKey="value" radius={[8, 8, 0, 0]} maxBarSize={56}>
            {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
          </Bar>
        </BarChart>,
        h,
      );

    // ============================================================
    // DIVERGING BAR — horizontal, positive=green, negative=red
    // ============================================================
    case 'DivergingBar':
      return chartWrapper(
        <BarChart data={data} layout="vertical" barCategoryGap="25%">
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f040" />
          <XAxis type="number" axisLine={false} tickLine={false} tick={AXIS_TICK} tickFormatter={fmtShort} />
          <YAxis dataKey="label" type="category" axisLine={false} tickLine={false} tick={AXIS_TICK} width={80} />
          <Tooltip formatter={(v: any) => [fmt(v), 'Value']} contentStyle={TOOLTIP_STYLE} />
          <ReferenceLine x={0} stroke="#e2e8f0" strokeWidth={1.5} />
          <Bar dataKey="value" radius={[0, 6, 6, 0]} maxBarSize={28}>
            {data.map((entry, i) => (
              <Cell key={i} fill={entry.value < 0 ? '#ef4444' : '#10b981'} />
            ))}
          </Bar>
        </BarChart>,
        h,
      );

    // ============================================================
    // WATERFALL — horizontal diverging with [Overall Drop] anchor
    // ============================================================
    case 'Waterfall':
      return chartWrapper(
        <BarChart data={data} layout="vertical" barCategoryGap="20%">
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f040" />
          <XAxis type="number" axisLine={false} tickLine={false} tick={AXIS_TICK} tickFormatter={fmtShort} />
          <YAxis dataKey="label" type="category" axisLine={false} tickLine={false} tick={AXIS_TICK} width={90} />
          <Tooltip formatter={(v: any) => [fmt(v), 'Value']} contentStyle={TOOLTIP_STYLE} />
          <ReferenceLine x={0} stroke="#94a3b8" strokeDasharray="3 3" />
          <Bar dataKey="value" radius={[0, 8, 8, 0]} maxBarSize={24}>
            {data.map((entry, i) => (
              <Cell
                key={i}
                fill={i === 0 ? '#6366f1' : entry.value < 0 ? '#ef4444' : '#10b981'}
                opacity={i === 0 ? 0.7 : 1}
              />
            ))}
          </Bar>
        </BarChart>,
        compact ? 160 : Math.max(180, data.length * 40),
      );

    // ============================================================
    // STACKED BAR
    // ============================================================
    case 'StackedBar':
      return chartWrapper(
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f040" />
          <XAxis dataKey="label" axisLine={false} tickLine={false} tick={AXIS_TICK} />
          <YAxis axisLine={false} tickLine={false} tick={AXIS_TICK} width={42} tickFormatter={fmtShort} />
          <Tooltip formatter={(v: any) => [fmt(v), 'Value']} contentStyle={TOOLTIP_STYLE} />
          <Bar dataKey="value" stackId="a" radius={[6, 6, 0, 0]} maxBarSize={56}>
            {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
          </Bar>
        </BarChart>,
        h,
      );

    // ============================================================
    // PIE / DONUT
    // ============================================================
    case 'Pie': {
      const pieData = data.filter(d => d.value > 0).slice(0, 6);
      return chartWrapper(
        <PieChart>
          <Pie
            data={pieData} dataKey="value" nameKey="label"
            cx="50%" cy="50%" outerRadius={compact ? 60 : 75} innerRadius={compact ? 30 : 38}
            paddingAngle={3} strokeWidth={0}
          >
            {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
          </Pie>
          <Tooltip formatter={(v: any) => [fmt(v), 'Value']} contentStyle={TOOLTIP_STYLE} />
        </PieChart>,
        h,
      );
    }

    // ============================================================
    // KPI CARD — single metric with delta
    // ============================================================
    case 'KPI': {
      const kpi = data[0];
      if (!kpi) return null;
      const hasDelta = kpi.prev_value != null;
      const deltaPct = hasDelta ? ((kpi.value - kpi.prev_value!) / Math.abs(kpi.prev_value!)) * 100 : null;
      const isUp = deltaPct != null && deltaPct >= 0;
      const colorClass = deltaPct == null ? 'text-slate-500' : isUp ? 'text-emerald-600' : 'text-red-500';

      return (
        <div className="kpi-card fade-in mt-3" style={{ animationDelay: '200ms' }}>
          <p className="kpi-label">{kpi.label}</p>
          <p className="kpi-value">{fmt(kpi.value)}</p>
          {hasDelta && deltaPct != null && (
            <div className={`kpi-delta ${colorClass}`}>
              {isUp ? <TrendingUp size={14} /> : deltaPct === 0 ? <Minus size={14} /> : <TrendingDown size={14} />}
              <span>{Math.abs(deltaPct).toFixed(1)}% vs prev</span>
            </div>
          )}
          {hasDelta && (
            <p className="kpi-prev">Previous: {fmt(kpi.prev_value!)}</p>
          )}
        </div>
      );
    }

    // ============================================================
    // GAUGE — circular progress
    // ============================================================
    case 'Gauge': {
      const g = data[data.length - 1];
      const target = g.prev_value ?? g.value * 1.2;
      const pct = Math.min(Math.max((g.value / target) * 100, 0), 100);
      const circumference = 2 * Math.PI * 45;
      const offset = circumference - (pct / 100) * circumference;
      const gaugeColor = pct >= 80 ? '#10b981' : pct >= 50 ? '#f59e0b' : '#ef4444';

      return (
        <div className="flex flex-col items-center justify-center py-4 mt-3 fade-in" style={{ animationDelay: '200ms' }}>
          <svg width={compact ? 110 : 130} height={compact ? 110 : 130} viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="45" fill="none" stroke="#f1f5f9" strokeWidth="8" />
            <circle
              cx="50" cy="50" r="45" fill="none"
              stroke={gaugeColor} strokeWidth="8" strokeLinecap="round"
              strokeDasharray={circumference} strokeDashoffset={offset}
              transform="rotate(-90 50 50)"
              style={{ transition: 'stroke-dashoffset 1.4s cubic-bezier(0.4,0,0.2,1)' }}
            />
            <text x="50" y="47" textAnchor="middle" fill="#1e293b" fontSize="17" fontWeight="700">
              {fmtShort(g.value)}
            </text>
            <text x="50" y="62" textAnchor="middle" fill="#94a3b8" fontSize="9">
              {g.label}
            </text>
          </svg>
          {g.prev_value != null && (
            <span className={`mt-1 text-xs font-medium ${g.value >= g.prev_value ? 'text-emerald-600' : 'text-red-500'}`}>
              vs target: {fmt(g.prev_value)}
            </span>
          )}
        </div>
      );
    }

    // ============================================================
    // BULLET CHART — actual vs target bar (Executive comparative)
    // ============================================================
    case 'Bullet': {
      const actual = data[data.length - 1];
      const target = actual.prev_value ?? actual.value * 1.15;
      const pct = Math.min((actual.value / target) * 100, 120);
      const barColor = pct >= 100 ? '#10b981' : pct >= 75 ? '#f59e0b' : '#ef4444';

      return (
        <div className="bullet-chart mt-3 fade-in px-2" style={{ animationDelay: '200ms' }}>
          <div className="flex justify-between text-xs text-slate-500 mb-1.5">
            <span>{actual.label}</span>
            <span>Target: {fmt(target)}</span>
          </div>
          <div className="bullet-track">
            <div className="bullet-range" style={{ width: '100%' }} />
            <div className="bullet-bar" style={{ width: `${Math.min(pct, 100)}%`, background: barColor }} />
            <div className="bullet-target-line" />
          </div>
          <div className="flex justify-between text-xs mt-1.5">
            <span className="font-semibold text-slate-700">{fmt(actual.value)}</span>
            <span className={`font-semibold ${barColor === '#10b981' ? 'text-emerald-600' : barColor === '#f59e0b' ? 'text-amber-500' : 'text-red-500'}`}>
              {pct.toFixed(1)}% of target
            </span>
          </div>
        </div>
      );
    }

    // ============================================================
    // SCATTER PLOT — for Analyst comparative
    // ============================================================
    case 'Scatter': {
      const scData = data.map(d => ({ x: d.prev_value ?? 0, y: d.value, name: d.label }));
      return chartWrapper(
        <ScatterChart>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f040" />
          <XAxis type="number" dataKey="x" name="Previous" axisLine={false} tickLine={false} tick={AXIS_TICK} tickFormatter={fmtShort} label={{ value: 'Previous', position: 'insideBottom', offset: -5, style: { fill: '#94a3b8', fontSize: 10 } }} />
          <YAxis type="number" dataKey="y" name="Current" axisLine={false} tickLine={false} tick={AXIS_TICK} tickFormatter={fmtShort} width={42} />
          <ZAxis range={[60, 60]} />
          <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={TOOLTIP_STYLE} formatter={(v: any) => [fmt(v)]} />
          <Scatter data={scData} fill="#3b82f6" />
        </ScatterChart>,
        h,
      );
    }

    // ============================================================
    // TREEMAP — SVG box visualization
    // ============================================================
    case 'Treemap': {
      const total = data.reduce((s, d) => s + Math.abs(d.value), 0);
      const sorted = [...data].sort((a, b) => b.value - a.value);
      let x = 0;
      return (
        <div className="treemap-container mt-3 fade-in" style={{ animationDelay: '200ms' }}>
          <svg width="100%" height={compact ? 140 : 170} viewBox="0 0 400 160" preserveAspectRatio="xMidYMid meet">
            {sorted.map((d, i) => {
              const w = (Math.abs(d.value) / total) * 400;
              const cx = x + w / 2;
              x += w;
              return (
                <g key={i}>
                  <rect x={x - w} y={0} width={w - 2} height={160} rx={8} fill={COLORS[i % COLORS.length]} opacity={0.85} />
                  <text x={cx - w / 2 + 6} y={24} fill="white" fontSize={10} fontWeight="600" opacity={w > 50 ? 1 : 0}>
                    {d.label}
                  </text>
                  <text x={cx - w / 2 + 6} y={40} fill="white" fontSize={11} fontWeight="700" opacity={w > 50 ? 1 : 0}>
                    {fmtShort(d.value)}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      );
    }

    // ============================================================
    // TABLE — Compliance/Analyst primary view
    // ============================================================
    case 'Table':
    default:
      return (
        <div className="overflow-x-auto mt-3 fade-in rounded-2xl" style={{ animationDelay: '200ms' }}>
          <table className="min-w-full text-sm" style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'rgba(248,250,252,0.8)' }}>
                <th className="px-5 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Label</th>
                <th className="px-5 py-2.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">Value</th>
                <th className="px-5 py-2.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">Previous</th>
                <th className="px-5 py-2.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">Δ%</th>
              </tr>
            </thead>
            <tbody>
              {data.map((d, i) => {
                const deltaPct = d.delta_pct ?? (
                  d.prev_value != null && d.prev_value !== 0
                    ? ((d.value - d.prev_value) / Math.abs(d.prev_value)) * 100
                    : null
                );
                const isPos = deltaPct != null && deltaPct >= 0;
                return (
                  <tr
                    key={i}
                    style={{
                      borderTop: '1px solid rgba(226,232,240,0.5)',
                      background: i % 2 === 0 ? 'transparent' : 'rgba(248,250,252,0.3)',
                    }}
                  >
                    <td className="px-5 py-2.5 text-slate-700 font-medium">{d.label}</td>
                    <td className="px-5 py-2.5 text-right text-slate-800 font-bold">{fmt(d.value)}</td>
                    <td className="px-5 py-2.5 text-right text-slate-500">{d.prev_value != null ? fmt(d.prev_value) : '—'}</td>
                    <td className={`px-5 py-2.5 text-right font-semibold text-xs ${deltaPct == null ? 'text-slate-400' : isPos ? 'text-emerald-600' : 'text-red-500'}`}>
                      {deltaPct != null ? `${isPos ? '+' : ''}${deltaPct.toFixed(1)}%` : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      );
  }
};
