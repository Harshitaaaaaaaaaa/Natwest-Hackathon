/**
 * MOCK DATA SERVICE
 * Returns sample data in the exact ML API schema you will receive.
 * When your real ML endpoint is live, set VITE_ML_API_URL in .env —
 * the insightAdapter will call the real API and this file is bypassed.
 *
 * All samples below mirror the ML contract:
 *   query_type | key_metrics | trend | breakdown | diagnostics |
 *   prediction | comparison | chart_data | confidence | limitations
 */

import type { GeminiIntent } from '../types';

// ── ML RESPONSE SCHEMA (matches real API contract exactly) ──────────────────

export interface MLMetric {
  name: string;
  value: number;
  unit: string;
}

export interface MLChartSeries {
  name: string;
  values: number[];
}

export interface MLChartData {
  chart_id: string;
  chart_type: 'line' | 'bar' | 'pie' | 'scatter';
  x_axis: string[];
  y_axis: string;
  series: MLChartSeries[];
}

export interface MLResponse {
  query_type: 'diagnostic' | 'descriptive' | 'comparative';
  key_metrics: MLMetric[];
  trend: {
    direction: 'upward' | 'downward' | 'stable';
    pattern: string;
  };
  breakdown: {
    category: { label: string; value: number }[];
    time: { label: string; value: number }[];
  };
  diagnostics: {
    causes: { cause: string; impact: 'high' | 'medium' | 'low'; change_pct: number }[];
    anomalies: { label: string; value: number; date: string }[];
  };
  prediction: {
    predicted_value: number;
    lower_bound: number;
    upper_bound: number;
    confidence: number;
  };
  comparison: {
    items: { label: string; value: number }[];
    winner: string;
    difference_pct: number;
  };
  chart_data: MLChartData[];
  confidence: number;
  limitations: string[];
}

// ── SAMPLE DATASETS ─────────────────────────────────────────────────────────

const DIAGNOSTIC_SPENDING: MLResponse = {
  query_type: 'diagnostic',
  key_metrics: [
    { name: 'current_spending',  value: 118000, unit: 'INR' },
    { name: 'previous_spending', value: 100000, unit: 'INR' },
    { name: 'change_percentage', value: 18,     unit: '%'   },
  ],
  trend: { direction: 'upward', pattern: 'steady_increase' },
  breakdown: {
    category: [
      { label: 'Food',     value: 42000 },
      { label: 'Travel',   value: 30000 },
      { label: 'Bills',    value: 22000 },
      { label: 'Shopping', value: 24000 },
    ],
    time: [
      { label: 'Week 1', value: 24000 },
      { label: 'Week 2', value: 26000 },
      { label: 'Week 3', value: 30000 },
      { label: 'Week 4', value: 38000 },
    ],
  },
  diagnostics: {
    causes: [
      { cause: 'Food spending increase',   impact: 'high',   change_pct: 25 },
      { cause: 'Travel spending increase', impact: 'medium', change_pct: 20 },
    ],
    anomalies: [
      { label: 'Unusual taxi expense', value: 5400, date: '2026-03-18' },
    ],
  },
  prediction: {
    predicted_value: 123000,
    lower_bound: 118000,
    upper_bound: 130000,
    confidence: 0.78,
  },
  comparison: {
    items: [
      { label: 'Online',  value: 56000 },
      { label: 'Offline', value: 49000 },
    ],
    winner: 'Online',
    difference_pct: 14,
  },
  chart_data: [
    {
      chart_id: 'trend_chart',
      chart_type: 'line',
      x_axis: ['Week 1', 'Week 2', 'Week 3', 'Week 4'],
      y_axis: 'Spending',
      series: [{ name: 'Spending', values: [24000, 26000, 30000, 38000] }],
    },
    {
      chart_id: 'category_chart',
      chart_type: 'bar',
      x_axis: ['Food', 'Travel', 'Bills', 'Shopping'],
      y_axis: 'Amount',
      series: [{ name: 'Spending', values: [42000, 30000, 22000, 24000] }],
    },
  ],
  confidence: 0.88,
  limitations: ['Only 2 months of data available'],
};

const DESCRIPTIVE_REVENUE: MLResponse = {
  query_type: 'descriptive',
  key_metrics: [
    { name: 'current_revenue',  value: 540000, unit: 'INR' },
    { name: 'previous_revenue', value: 490000, unit: 'INR' },
    { name: 'change_percentage', value: 10.2, unit: '%' },
  ],
  trend: { direction: 'upward', pattern: 'gradual_growth' },
  breakdown: {
    category: [
      { label: 'Product A', value: 220000 },
      { label: 'Product B', value: 180000 },
      { label: 'Services',  value: 140000 },
    ],
    time: [
      { label: 'Jan', value: 160000 },
      { label: 'Feb', value: 175000 },
      { label: 'Mar', value: 205000 },
    ],
  },
  diagnostics: {
    causes: [
      { cause: 'Product A upsell campaign', impact: 'high',   change_pct: 15 },
      { cause: 'New service tier launch',   impact: 'medium', change_pct: 8  },
    ],
    anomalies: [
      { label: 'Weekend spike (Feb 14)', value: 18000, date: '2026-02-14' },
    ],
  },
  prediction: {
    predicted_value: 580000,
    lower_bound: 560000,
    upper_bound: 610000,
    confidence: 0.82,
  },
  comparison: {
    items: [
      { label: 'Q1 FY26', value: 540000 },
      { label: 'Q1 FY25', value: 490000 },
    ],
    winner: 'Q1 FY26',
    difference_pct: 10.2,
  },
  chart_data: [
    {
      chart_id: 'revenue_trend',
      chart_type: 'line',
      x_axis: ['Jan', 'Feb', 'Mar'],
      y_axis: 'Revenue (INR)',
      series: [{ name: 'Revenue', values: [160000, 175000, 205000] }],
    },
    {
      chart_id: 'product_breakdown',
      chart_type: 'bar',
      x_axis: ['Product A', 'Product B', 'Services'],
      y_axis: 'Revenue (INR)',
      series: [{ name: 'Revenue', values: [220000, 180000, 140000] }],
    },
  ],
  confidence: 0.91,
  limitations: ['Data excludes refunds and chargebacks'],
};

const COMPARATIVE_CHANNELS: MLResponse = {
  query_type: 'comparative',
  key_metrics: [
    { name: 'online_sales',  value: 56000, unit: 'INR' },
    { name: 'offline_sales', value: 49000, unit: 'INR' },
    { name: 'difference_pct', value: 14,   unit: '%'   },
  ],
  trend: { direction: 'upward', pattern: 'online_overtaking_offline' },
  breakdown: {
    category: [
      { label: 'Online',  value: 56000 },
      { label: 'Offline', value: 49000 },
    ],
    time: [
      { label: 'Week 1', value: 10000 },
      { label: 'Week 2', value: 12000 },
      { label: 'Week 3', value: 15000 },
      { label: 'Week 4', value: 19000 },
    ],
  },
  diagnostics: {
    causes: [
      { cause: 'Online app promotions',   impact: 'high',   change_pct: 22 },
      { cause: 'Offline footfall decline', impact: 'medium', change_pct: -8 },
    ],
    anomalies: [
      { label: 'Flash sale spike (Mar 15)', value: 9200, date: '2026-03-15' },
    ],
  },
  prediction: {
    predicted_value: 62000,
    lower_bound: 58000,
    upper_bound: 67000,
    confidence: 0.75,
  },
  comparison: {
    items: [
      { label: 'Online',  value: 56000 },
      { label: 'Offline', value: 49000 },
    ],
    winner: 'Online',
    difference_pct: 14,
  },
  chart_data: [
    {
      chart_id: 'channel_comparison',
      chart_type: 'bar',
      x_axis: ['Online', 'Offline'],
      y_axis: 'Sales (INR)',
      series: [{ name: 'Sales', values: [56000, 49000] }],
    },
  ],
  confidence: 0.85,
  limitations: ['Offline data may have a 2-day reporting lag'],
};

// ── PUBLIC FETCH FUNCTION ────────────────────────────────────────────────────

export async function fetchMLSample(intent: GeminiIntent): Promise<MLResponse> {
  // Simulate ML API latency
  await new Promise(resolve => setTimeout(resolve, 600 + Math.random() * 400));

  if (intent.query_type === 'Comparative') return COMPARATIVE_CHANNELS;
  if (intent.query_type === 'Diagnostic')  return DIAGNOSTIC_SPENDING;
  return DESCRIPTIVE_REVENUE;
}

// Keep legacy DummyMLResult export so nothing else breaks during transition
export type { MLResponse as DummyMLResult };
