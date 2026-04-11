/**
 * MOCK DATA SERVICE
 * Returns sample MLOutputContract data matching the real ML API contract.
 * When your real ML endpoint is live, set VITE_ML_API_URL in .env —
 * the insightAdapter will call the real API and this file is bypassed.
 */

import type { GeminiIntent, MLOutputContract } from '../types';

// ── SAMPLE DATASETS ──────────────────────────────────────────────────────────────
const DIAGNOSTIC_SPENDING: MLOutputContract = {
  query_type: ['Diagnostic', 'Descriptive'],
  key_metrics: [
    { label: 'Current Spending', value: 118000, prev_value: 100000, unit: 'INR', delta: 18000, delta_pct: 18 },
  ],
  trend: [
    { label: 'Week 1', value: 24000, prev_value: null },
    { label: 'Week 2', value: 26000, prev_value: null },
    { label: 'Week 3', value: 30000, prev_value: null },
    { label: 'Week 4', value: 38000, prev_value: null },
  ],
  breakdown: [
    { label: 'Food', value: 42000, prev_value: null },
    { label: 'Travel', value: 30000, prev_value: null },
    { label: 'Bills', value: 22000, prev_value: null },
    { label: 'Shopping', value: 24000, prev_value: null },
  ],
  diagnostics: [
    'Food spending increase (+25%)',
    'Travel spending increase (+20%)',
    'Unusual taxi expense: ₹5,400 on 2026-03-18'
  ],
  prediction: { label: 'Next Month Predicted', value: 123000, confidence: 0.78 },
  comparison: [],
  chart_data: [
    {
      id: 'diagnostic_spending_breakdown',
      type: 'Waterfall',
      title: 'Spending Breakdown drivers',
      data: [
        { label: 'Start (Prev)', value: 100000, prev_value: null },
        { label: 'Food', value: 8400, prev_value: null },
        { label: 'Travel', value: 5000, prev_value: null },
        { label: 'Other', value: 4600, prev_value: null },
        { label: 'End (Curr)', value: 118000, prev_value: null }
      ]
    }
  ],
  recommendations: ['Review food vendor contracts', 'Set alert for unexpected travel bookings'],
  confidence: 0.88,
  limitations: ['Only 2 months of data available'],
  warnings: ['High variance in taxi spend'],
  summary: 'Spending increased by 18% driven by Food and Travel categories.',
  summary_levels: {
    simple: 'You spent ₹1,18,000 this month, which is ₹18,000 more than last month. Mostly went to Food and Travel.',
    medium: 'Total spending increased by 18% to ₹1,18,000. Food (+25%) and Travel (+20%) were the primary drivers of this jump.',
    advanced: 'Monthly outflow reached ₹1,18,000 (Δ +18%). The ₹18,000 variance is entirely explained by Food (+₹8.4k), Travel (+₹5k), and a ₹5.4k anomalous taxi expense.'
  }
};

const DESCRIPTIVE_REVENUE: MLOutputContract = {
  query_type: ['Descriptive'],
  key_metrics: [
    { label: 'Current Revenue', value: 540000, prev_value: 490000, unit: 'INR', delta: 50000, delta_pct: 10.2 },
  ],
  trend: [
    { label: 'Jan', value: 160000, prev_value: null },
    { label: 'Feb', value: 175000, prev_value: null },
    { label: 'Mar', value: 205000, prev_value: null },
  ],
  breakdown: [
    { label: 'Product A', value: 220000, prev_value: null },
    { label: 'Product B', value: 180000, prev_value: null },
    { label: 'Services', value: 140000, prev_value: null },
  ],
  diagnostics: [
    'Product A upsell campaign (+15%)',
    'Weekend spike: ₹18,000 on 2026-02-14'
  ],
  prediction: { label: 'Next Month Predicted', value: 580000, confidence: 0.82 },
  comparison: [],
  chart_data: [
    {
      id: 'revenue_trend',
      type: 'Line',
      title: 'Revenue over Time',
      data: [
        { label: 'Jan', value: 160000, prev_value: null },
        { label: 'Feb', value: 175000, prev_value: null },
        { label: 'Mar', value: 205000, prev_value: null },
      ]
    }
  ],
  recommendations: ['Replicate Product A campaign', 'Analyze weekend traffic'],
  confidence: 0.91,
  limitations: ['Data excludes refunds'],
  warnings: [],
  summary: 'Revenue is tracking at ₹5.4L, a 10.2% increase.',
  summary_levels: {
    simple: 'You made ₹5,40,000 this quarter, which is better than last quarter.',
    medium: 'Revenue grew by 10.2% to ₹5,40,000. Product A was the best seller.',
    advanced: 'Q1 Topline stood at ₹5.4L (+10.2% QoQ). Product A drove ₹2.2L (40% of mix), heavily weighted by a mid-quarter upsell campaign.'
  }
};

const COMPARATIVE_CHANNELS: MLOutputContract = {
  query_type: ['Comparative'],
  key_metrics: [
    { label: 'Online Sales', value: 56000, prev_value: null, unit: 'INR' },
    { label: 'Offline Sales', value: 49000, prev_value: null, unit: 'INR' }
  ],
  trend: [
    { label: 'Week 1', value: 10000, prev_value: null },
    { label: 'Week 2', value: 12000, prev_value: null },
    { label: 'Week 3', value: 15000, prev_value: null },
    { label: 'Week 4', value: 19000, prev_value: null },
  ],
  breakdown: [
    { label: 'Online', value: 56000, prev_value: null },
    { label: 'Offline', value: 49000, prev_value: null },
  ],
  diagnostics: [
    'Online app promotions driven +22%',
    'Flash sale spike: ₹9,200 on 2026-03-15'
  ],
  prediction: { label: 'Online Next Week', value: 62000, confidence: 0.75 },
  comparison: [],
  chart_data: [
    {
      id: 'channel_comparison',
      type: 'Bar',
      title: 'Online vs Offline',
      data: [
        { label: 'Online', value: 56000, prev_value: null },
        { label: 'Offline', value: 49000, prev_value: null },
      ]
    }
  ],
  recommendations: ['Investigate offline footfall drop'],
  confidence: 0.85,
  limitations: ['Offline data has 2-day lag'],
  warnings: [],
  summary: 'Online sales outperformed Offline by 14%.',
  summary_levels: {
    simple: 'Online sales (₹56,000) beat offline sales (₹49,000).',
    medium: 'Online channels generated 14% more sales than Physical stores, driven by recent app promotions.',
    advanced: 'Channel divergence observed: Online captured ₹56k volume (+14% vs Offline ₹49k). App promotion elasticity offset a -8% YoY footfall decline in brick-and-mortar.'
  }
};

// ── PUBLIC FETCH FUNCTION ────────────────────────────────────────────────────

export async function fetchMLSample(intent: GeminiIntent): Promise<MLOutputContract> {
  // Simulate ML API latency
  await new Promise(resolve => setTimeout(resolve, 600 + Math.random() * 400));

  if (intent.query_type === 'Comparative') return COMPARATIVE_CHANNELS;
  if (intent.query_type === 'Diagnostic')  return DIAGNOSTIC_SPENDING;
  return DESCRIPTIVE_REVENUE;
}

// Keep legacy DummyMLResult export so nothing else breaks during transition
export type { MLOutputContract as DummyMLResult, MLOutputContract as MLResponse };
