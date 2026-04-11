import type {
  GeminiIntent, NormalizedInsight, Persona, QueryType,
  SuggestedVisual, MetricPoint,
} from '../types';
import { fetchMLSample, type MLResponse } from './mockDataService';
import { GoogleGenerativeAI } from '@google/generative-ai';

const REAL_API_URL = import.meta.env.VITE_ML_API_URL || '';
const API_KEY = import.meta.env.VITE_GEMINI_API_KEY || '';

// ================================================================
// PUBLIC ENTRY POINT
// Components call ONLY this function — they never know if data
// comes from a real ML API or the mock service.
// ================================================================

export async function getInsightResponse(
  query: string,
  intent: GeminiIntent,
  persona: Persona,
): Promise<NormalizedInsight> {
  let insight: NormalizedInsight;

  if (REAL_API_URL) {
    try {
      insight = await fetchFromRealAPI(query, intent, persona);
    } catch (err) {
      console.warn('[insightAdapter] Real API unavailable, switching to mock:', err);
      insight = await fetchFromMock(query, intent, persona);
    }
  } else {
    insight = await fetchFromMock(query, intent, persona);
  }

  // Optionally enrich summary + recommendations with Gemini (non-blocking)
  if (API_KEY) {
    try {
      insight = await enrichWithGemini(insight, query, persona);
    } catch {
      // Gemini enrichment failed — use the mock-generated strings as-is
    }
  }

  return insight;
}

// ================================================================
// REAL API PATH
// POST /insight → normalizeMLResponse → NormalizedInsight
// The real ML API returns the same schema as the mock (MLResponse).
// ================================================================

async function fetchFromRealAPI(
  query: string,
  intent: GeminiIntent,
  persona: Persona,
): Promise<NormalizedInsight> {
  const response = await fetch(`${REAL_API_URL}/insight`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, intent, persona }),
  });

  if (!response.ok) throw new Error(`ML API error: ${response.status}`);

  const raw: MLResponse = await response.json();
  return normalizeMLResponse(raw, query, intent, persona);
}

// ================================================================
// ML RESPONSE NORMALIZER
// Maps the exact ML API schema → NormalizedInsight.
// Used by both the mock path and the real API path.
// ================================================================

function normalizeMLResponse(
  ml: MLResponse,
  query: string,
  intent: GeminiIntent,
  persona: Persona,
): NormalizedInsight {
  // -- key_metrics → metrics (current vs previous) ---------------
  const current  = ml.key_metrics.find(m => m.name.includes('current'));
  const previous = ml.key_metrics.find(m => m.name.includes('previous') || m.name.includes('prev'));
  const changePct = ml.key_metrics.find(m => m.name.includes('change') || m.name.includes('pct'));

  const mainMetricLabel = current?.name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) ?? 'Value';
  const metrics: MetricPoint[] = [
    {
      label: mainMetricLabel,
      value: current?.value ?? 0,
      prev_value: previous?.value ?? null,
      unit: current?.unit,
      delta: current && previous ? current.value - previous.value : undefined,
      delta_pct: changePct?.value ?? (
        current && previous && previous.value !== 0
          ? ((current.value - previous.value) / Math.abs(previous.value)) * 100
          : undefined
      ),
    },
  ];

  // -- breakdown.time → trend time-series -------------------------
  const trendPoints: MetricPoint[] = (ml.breakdown?.time ?? []).map(t => ({
    label: t.label,
    value: t.value,
    prev_value: null,
  }));

  // -- breakdown.category → breakdown drivers ---------------------
  const breakdownPoints: MetricPoint[] = (ml.breakdown?.category ?? []).map(c => ({
    label: c.label,
    value: c.value,
    prev_value: null,
  }));

  // -- diagnostics.anomalies → anomaly strings --------------------
  const anomalies: string[] = (ml.diagnostics?.anomalies ?? []).map(
    a => `${a.label}: ₹${a.value.toLocaleString('en-IN')} on ${a.date}`,
  );

  // -- diagnostics.causes → math_details -------------------------
  const causesText = (ml.diagnostics?.causes ?? [])
    .map(c => `${c.cause} (${c.cause === 'positive' ? '+' : ''}${c.change_pct}%, impact: ${c.impact})`)
    .join(' | ');

  // -- prediction ------------------------------------------------
  const prediction = ml.prediction
    ? {
        label: 'Predicted Value',
        value: ml.prediction.predicted_value,
        confidence: ml.prediction.confidence,
      }
    : null;

  // -- chart_data → primary chart --------------------------------
  // Use chart_data[0] as the primary visual source when available.
  const ML_CHART_TYPE_MAP: Record<string, SuggestedVisual> = {
    line: 'Line', bar: 'Bar', pie: 'Pie', scatter: 'Scatter',
  };

  const primaryChartDef = ml.chart_data?.[0];
  const secondaryChartDef = ml.chart_data?.[1] ?? null;

  // Flatten series values back into MetricPoint arrays
  const chartDefToPoints = (cd: typeof primaryChartDef): MetricPoint[] => {
    if (!cd) return breakdownPoints;
    const vals = cd.series[0]?.values ?? [];
    return cd.x_axis.map((label, i) => ({ label, value: vals[i] ?? 0, prev_value: null }));
  };

  // If user explicitly requested a chart type, respect it; otherwise use ML's chart_type
  let primaryVisual: SuggestedVisual = intent.explicit_visual_request
    ? intent.suggested_visual
    : (ML_CHART_TYPE_MAP[primaryChartDef?.chart_type ?? ''] ?? intent.suggested_visual);

  const secondaryVisual: SuggestedVisual | null = secondaryChartDef
    ? (ML_CHART_TYPE_MAP[secondaryChartDef.chart_type] ?? 'Bar')
    : null;

  const primaryData = chartDefToPoints(primaryChartDef);
  const secondaryData = secondaryChartDef ? chartDefToPoints(secondaryChartDef) : null;

  // -- summary generation ----------------------------------------
  const trendWord = ml.trend?.direction === 'upward' ? 'increased' : ml.trend?.direction === 'downward' ? 'decreased' : 'remained stable';
  const changePctVal = changePct?.value ?? metrics[0]?.delta_pct;
  const main_summary = current
    ? `Spending ${trendWord} by ${changePctVal != null ? `${Math.abs(changePctVal)}%` : 'noticeably'} — from ${(previous?.value ?? 0).toLocaleString('en-IN')} to ${current.value.toLocaleString('en-IN')} ${current.unit}.`
    : 'Analysis complete.';

  // -- formula/math details --------------------------------------
  const math_details = [
    current && previous
      ? `Δ = ${current.value.toLocaleString('en-IN')} − ${previous.value.toLocaleString('en-IN')} = ${(current.value - previous.value).toLocaleString('en-IN')} (${changePctVal?.toFixed(1)}%)`
      : '',
    causesText,
  ].filter(Boolean).join('. ');

  return {
    query_type: (ml.query_type?.charAt(0).toUpperCase() + ml.query_type?.slice(1)) as QueryType ?? intent.query_type,
    persona,
    main_summary,
    metrics,
    trend: trendPoints,
    breakdown: breakdownPoints,
    anomalies,
    prediction,
    chart: {
      primary: primaryVisual,
      secondary: secondaryVisual,
      data: primaryData,
      secondary_data: secondaryData,
    },
    recommendations: [],  // filled by buildRecommendations() in normalizeMockData or enriched by Gemini
    confidence: ml.confidence ?? intent.confidence_score ?? 0.8,
    limitations: ml.limitations ?? [],
    metadata: {
      source: 'ML Analytics Engine',
      timestamp: new Date().toISOString(),
      query,
      math_details,
      audit_log: `[SYSTEM-AUDIT] ML response processed at ${new Date().toISOString()}. Query: "${query}". Persona: ${persona}.`,
      formula: math_details,
      filters: `query_type=${ml.query_type} | persona=${persona} | metric=${current?.name ?? 'unknown'}`,
    },
  };
}

// ================================================================
// MOCK PATH
// fetchMLSample → normalizeMLResponse → applyPersonaChartRules
// ================================================================

async function fetchFromMock(
  query: string,
  intent: GeminiIntent,
  persona: Persona,
): Promise<NormalizedInsight> {
  const mlSample = await fetchMLSample(intent);
  const insight = normalizeMLResponse(mlSample, query, intent, persona);
  // Apply persona chart rules and recommendations on top of ML data
  return applyPersonaRules(insight, intent, persona, mlSample);
}

// ================================================================
// APPLY PERSONA RULES
// Called after normalizeMockData to overlay persona-specific chart
// selection and recommendations on the already-normalized insight.
// ================================================================

function applyPersonaRules(
  insight: NormalizedInsight,
  intent: GeminiIntent,
  persona: Persona,
  ml: MLResponse,
): NormalizedInsight {
  const baseData = insight.chart.data;
  const allBreakdown = insight.breakdown.length > 0 ? insight.breakdown : baseData;

  let primaryVisual: SuggestedVisual = insight.chart.primary;
  let secondaryVisual: SuggestedVisual | null = insight.chart.secondary;
  let secondaryData: MetricPoint[] | null = insight.chart.secondary_data;

  // ── EXPLICIT VISUAL REQUEST — user named a chart type ──────────
  if (intent.explicit_visual_request) {
    primaryVisual = intent.suggested_visual;
    if (persona === 'Analyst' || persona === 'Compliance') {
      secondaryVisual = 'Table';
      secondaryData = allBreakdown;
    } else {
      secondaryVisual = null; secondaryData = null;
    }
  } else {
    // ── DEFAULT PERSONA RULES ─────────────────────────────────────
    const qt = intent.query_type;

    if (persona === 'Beginner') {
      if (qt === 'Diagnostic' || qt === 'Comparative') primaryVisual = 'Bar';
      secondaryVisual = null; secondaryData = null;
    } else if (persona === 'Everyday') {
      if (qt === 'Diagnostic') primaryVisual = 'Waterfall';
      secondaryVisual = null; secondaryData = null;
    } else if (persona === 'SME') {
      if (qt === 'Diagnostic') primaryVisual = 'Waterfall';
      if (qt === 'Descriptive') { secondaryVisual = 'KPI'; secondaryData = insight.metrics; }
      else { secondaryVisual = null; secondaryData = null; }
    } else if (persona === 'Executive') {
      if (qt === 'Descriptive') primaryVisual = 'KPI';
      if (qt === 'Comparative') primaryVisual = 'DivergingBar';
      if (qt === 'Diagnostic') primaryVisual = 'Waterfall';
      secondaryVisual = null; secondaryData = null;
    } else if (persona === 'Analyst') {
      if (qt === 'Diagnostic') primaryVisual = 'Waterfall';
      if (qt === 'Comparative') primaryVisual = 'DivergingBar';
      secondaryVisual = 'Table'; secondaryData = allBreakdown;
    } else if (persona === 'Compliance') {
      primaryVisual = 'Table'; secondaryVisual = null; secondaryData = null;
    }

    // For Analyst/Compliance, populate chart data from breakdown for richness
    if (persona === 'Analyst' || persona === 'Compliance') {
      primaryVisual = primaryVisual; // keep
    }
  }

  const recommendations = buildRecommendations(persona, intent.query_type);

  // Diagnostics-aware chart data: for Diagnostic, use breakdown (cause breakdown)
  const chartData = (intent.query_type === 'Diagnostic' && allBreakdown.length > 0)
    ? allBreakdown
    : baseData;

  return {
    ...insight,
    chart: {
      primary: primaryVisual,
      secondary: secondaryVisual,
      data: chartData,
      secondary_data: secondaryData,
    },
    recommendations,
    _wasExplicitVisualRequest: intent.explicit_visual_request ?? false,
  } as NormalizedInsight & { _wasExplicitVisualRequest: boolean };
}

// ================================================================
// GEMINI ENRICHMENT (optional — enriches main_summary per persona)
// Called after mock/API data is retrieved, not before.
// ================================================================

async function enrichWithGemini(
  insight: NormalizedInsight,
  query: string,
  persona: Persona,
): Promise<NormalizedInsight> {
  const TONE_GUIDE: Record<Persona, string> = {
    Beginner: 'Use warm, simple, everyday language. Max 1 sentence. No jargon.',
    Everyday: 'Be concise and practical. Focus on the useful takeaway. 1-2 sentences.',
    SME: 'Use operational language. Mention KPI movement and business meaning. 2 sentences.',
    Executive: 'Impact-first. Start with the business consequence. Be brief and strategic. 1-2 sentences.',
    Analyst: 'Be precise. Include exact values, comparison basis, and time window. 2 sentences.',
    Compliance: 'Use literal, exact, auditable language. Include source reference. No unsupported inference.',
  };

  const genAI = new GoogleGenerativeAI(API_KEY);
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: { responseMimeType: 'application/json' },
  });

  const prompt = `
You are a data interpretation assistant for a Talk-to-Data system.
The ML backend returned this insight about the user's query: "${query}"

Raw summary: "${insight.main_summary}"
Query type: ${insight.query_type}
Data points: ${JSON.stringify(insight.metrics.slice(0, 5))}

User persona: ${persona}
Tone guide: ${TONE_GUIDE[persona]}

Respond ONLY with this JSON:
{
  "main_summary": "Rewritten summary matching the tone guide.",
  "insight_text": "1-2 sentence explanation of WHY this matters for the persona.",
  "action_text": "One concrete next step the persona should take."
}
`;

  const result = await model.generateContent(prompt);
  const parsed = JSON.parse(result.response.text().trim());

  return {
    ...insight,
    main_summary: parsed.main_summary ?? insight.main_summary,
    insight_text: parsed.insight_text,
    // Inject enriched texts into recommendations array as strict actions only
    recommendations: [
      parsed.action_text ?? insight.recommendations[0] ?? '',
      ...insight.recommendations.slice(1),
    ].filter(Boolean),
  };
}

// ================================================================
// RECOMMENDATION ENGINE (fallback / mock path)
// Per-persona, per-query-type recommendation sets
// ================================================================

function buildRecommendations(persona: Persona, queryType: QueryType): string[] {
  const recs: Record<Persona, Partial<Record<QueryType, string[]>> & { Default: string[] }> = {
    Beginner: {
      Descriptive: ['Show me a basic breakdown.', 'What changed recently?'],
      Comparative: ['Why is the second one lower?', 'Show me the exact differences.'],
      Diagnostic: ['What is the main cause?', 'Is this something to worry about?'],
      Unknown: ['Can you explain this simply?', 'Show me the raw numbers.'],
      Default: ['Give me a more detailed view.'],
    },
    Everyday: {
      Descriptive: ['Has this trend continued this week?', 'Provide a product breakdown.'],
      Comparative: ['How do these compare to last month?', 'Which one is growing faster?'],
      Diagnostic: ['What are the top 3 drivers?', 'Did a specific event cause this spike?'],
      Unknown: ['Can you recalculate this differently?', 'Show me the trend line.'],
      Default: ['Break this down further.'],
    },
    SME: {
      Descriptive: ['How does this compare to our Q3 target?', 'Drill down into regional performance.'],
      Comparative: ['Which product line drove the biggest gap?', 'Compare this to the industry benchmark.'],
      Diagnostic: ['Show me the detailed root cause analysis.', 'Is this variance isolated or structural?'],
      Unknown: ['Clarify the data source for this query.'],
      Default: ['Generate an operational review summary.'],
    },
    Executive: {
      Descriptive: ['Is this tracking against strategic targets?', 'Give me the top line summary.'],
      Comparative: ['Is this gap structural or a one-time anomaly?', 'How does this affect resource allocation?'],
      Diagnostic: ['What corrective action is required?', 'Run a scenario analysis for Q4.'],
      Unknown: ['Explain the strategic impact.'],
      Default: ['Group this by leading indicators.'],
    },
    Analyst: {
      Descriptive: ['Segment this data by dimension.', 'Apply a seasonal adjustment to the trend line.'],
      Comparative: ['Run a significance test on this delta.', 'Decompose variance by sub-dimension.'],
      Diagnostic: ['Validate drivers with the alternate data model.', 'Check for confounders in the residual.'],
      Unknown: ['Re-run with explicit dimension filters.'],
      Default: ['Show the exact source data table.'],
    },
    Compliance: {
      Descriptive: ['Confirm timestamp matches the system-of-record.', 'Extract full audit trail for these figures.'],
      Comparative: ['Flag any source calculation discrepancies.', 'Cross-reference with policy baseline thresholds.'],
      Diagnostic: ['Map these drivers to the control framework.', 'Verify all contributor calculations.'],
      Unknown: ['Provide the manual override documentation.'],
      Default: ['Show exactly how this was calculated.'],
    },
  };

  const personaRecs = recs[persona] ?? recs.Beginner;
  return (personaRecs[queryType] ?? personaRecs.Default ?? []) as string[];
}
