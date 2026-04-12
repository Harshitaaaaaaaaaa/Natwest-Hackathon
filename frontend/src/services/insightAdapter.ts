/**
 * INSIGHT ADAPTER v3
 *
 * Routes ALL analytical queries through the real backend pipeline:
 *   Frontend → POST /api/query → Node orchestrator → LLM execution plan →
 *   Python engine (Superstore.csv) → MLOutputContract
 *
 * Flow:
 *   1. fetchFromBackend(query)   → raw engine JSON from real Superstore data
 *   2. adaptEngineOutput(raw)    → MLOutputContract
 *   3. applyPersonaRules(ml)     → persona-specific chart selection
 *   4. enrichWithGroq(ml)       → summary_levels rewritten per persona (optional)
 */

import type { GeminiIntent, MLOutputContract, MetricPoint, ChartDataContract, Persona, SuggestedVisual, DatasetSchema } from '../types';

const CHAT_API_URL = import.meta.env.VITE_CHAT_API_URL || 'http://localhost:5000';
const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY || '';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.3-70b-versatile';

// ── Groq helper ─────────────────────────────────────────────────
async function groqChat(
  systemPrompt: string,
  userPrompt: string,
  jsonMode = false,
): Promise<string> {
  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GROQ_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.2,
      ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Groq API ${res.status}: ${err}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() ?? '';
}

// ================================================================
// PUBLIC ENTRY POINT
// ================================================================

export async function getInsightResponse(
  query: string,
  intent: GeminiIntent,
  persona: Persona,
  datasetRef: string,
  datasetSchema: DatasetSchema | null,
  language: string,
): Promise<MLOutputContract> {
  let ml: MLOutputContract;

  try {
    ml = await fetchFromBackend(query, datasetRef, datasetSchema, language);
  } catch (err) {
    console.error('[insightAdapter] Backend query failed:', err);
    throw err; // Let the caller (PresentationShell) handle the error display
  }

  // Merge query_type: union of frontend classifier + engine response
  // This ensures tags show all detected intents even if one side missed one
  const classifierTypes = (intent.query_type ?? []).map(t => t.toLowerCase());
  const engineTypes = (ml.query_type ?? []).map(t => t.toLowerCase());
  const mergedSet = new Set([...engineTypes, ...classifierTypes]);
  // Remove 'unknown'; capitalize for display
  mergedSet.delete('unknown');
  ml.query_type = [...mergedSet].map(t => t.charAt(0).toUpperCase() + t.slice(1));

  // Apply persona-specific chart selection rules
  ml = applyPersonaRules(ml, intent, persona);

  // Optionally enrich summary_levels with Groq (non-blocking)
  if (GROQ_API_KEY) {
    try {
      ml = await enrichWithGroq(ml, query, persona, language);
    } catch {
      // Groq enrichment failed — use pre-generated summary_levels as-is
    }
  }

  return ml;
}

// ================================================================
// REAL BACKEND PATH — calls /api/query which runs the full pipeline:
// LLM orchestrator → Python execution engine → Superstore.csv
// ================================================================

async function fetchFromBackend(query: string, dataset_ref: string, target_schema: DatasetSchema | null, language: string): Promise<MLOutputContract> {
  const response = await fetch(`${CHAT_API_URL}/api/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, dataset_ref, target_schema, language }),
  });

  if (!response.ok) {
    const errBody = await response.json().catch(() => ({}));
    throw new Error((errBody as any).message ?? `Backend error ${response.status}`);
  }

  const raw = await response.json();
  return adaptEngineOutput(raw as Record<string, unknown>);
}

// ================================================================
// ENGINE OUTPUT ADAPTER
// Transforms the raw Python execution engine response into the strict
// MLOutputContract shape the responseMapper and MessageBubble expect.
// ================================================================

function adaptEngineOutput(raw: Record<string, unknown>): MLOutputContract {
  // ── Key metrics ───────────────────────────────────────────────────
  const rawMetrics = (raw.key_metrics as any[]) ?? [];
  const key_metrics: MetricPoint[] = rawMetrics.map((m: any) => ({
    label:      m.name   ?? 'metric',
    value:      m.value  ?? 0,
    unit:       m.unit   ?? '',
    prev_value: null,
    delta:      undefined,
    delta_pct:  undefined,
    category:   m.type   ?? undefined,
  }));

  // ── Trend ─────────────────────────────────────────────────────────
  const rawTrend = (raw.trend as Record<string, unknown>) ?? {};
  const trend: MetricPoint[] = rawTrend.direction
    ? [{
        label:      String(rawTrend.direction),
        value:      Number(rawTrend.change_rate ?? 0),
        unit:       '%',
        prev_value: null,
        category:   String(rawTrend.pattern ?? ''),
      }]
    : [];

  // ── Breakdown → flat array ────────────────────────────────────────
  const rawBreakdown = (raw.breakdown as Record<string, any[]>) ?? {};
  const breakdown: MetricPoint[] = [];

  for (const [key, arr] of Object.entries(rawBreakdown)) {
    if (key !== 'time' && Array.isArray(arr)) {
      arr.forEach((b: any) => {
        breakdown.push({
          label:      b.label ?? '',
          value:      b.value ?? 0,
          unit:       'USD', // Note: dynamically passing unit via python is next iteration
          prev_value: null,
          category:   b.percentage != null ? `${key}: ${b.percentage}%` : key,
        });
      });
    }
  }

  // ── Diagnostics → string array ────────────────────────────────────
  const rawDiag = (raw.diagnostics as { causes?: any[]; anomalies?: any[] }) ?? {};
  const diagnostics: string[] = [
    ...(rawDiag.causes ?? []).map((c: any) =>
      `${c.cause}: ${c.direction ?? ''} (${c.contribution_pct ?? c.impact ?? ''}%) — ${c.evidence ?? ''}`
    ),
    ...(rawDiag.anomalies ?? []).map((a: any) =>
      `Anomaly: ${a.label} = $${Number(a.value).toLocaleString()} on ${a.date} [${a.severity}]`
    ),
  ];

  // ── Prediction ────────────────────────────────────────────────────
  const rawPred = (raw.prediction as Record<string, unknown>) ?? {};
  const prediction = rawPred.predicted_value != null
    ? {
        label:      String(rawPred.horizon ?? 'Next period'),
        value:      Number(rawPred.predicted_value),
        confidence: Number(rawPred.confidence ?? raw.confidence ?? 0.7),
      }
    : null;

  // ── Comparison ────────────────────────────────────────────────────
  const rawComp = (raw.comparison as Record<string, unknown>) ?? {};
  const comparison: MetricPoint[] = Array.isArray(rawComp.items)
    ? (rawComp.items as any[]).map((item: any) => ({
        label:      item.label,
        value:      item.value,
        unit:       'USD',
        prev_value: null,
      }))
    : [];

  // ── Chart data ────────────────────────────────────────────────────
  const rawCharts = (raw.chart_data as any[]) ?? [];
  const chart_data: ChartDataContract[] = rawCharts.map((c: any, i) => {
    const typeMap: Record<string, any> = {
      line: 'Line', bar: 'Bar', pie: 'Pie', scatter: 'Scatter',
    };
    const chartType = typeMap[c.chart_type?.toLowerCase?.()] ?? 'Bar';

    const xAxis: string[] = c.x_axis ?? [];
    const allSeries: { name: string; values: (number | null)[] }[] = c.series ?? [];

    const data: MetricPoint[] = xAxis.map((label: string, idx: number) => {
      const v0 = allSeries[0]?.values?.[idx];
      const v1 = allSeries[1]?.values?.[idx];
      const isFiniteNum = (v: any): v is number => v !== null && v !== undefined && Number.isFinite(Number(v));

      let value: number = 0;
      let prev_value: number | null = null;

      if (allSeries.length <= 1) {
        // Single series
        value = isFiniteNum(v0) ? Number(v0) : 0;
      } else if (isFiniteNum(v0) && isFiniteNum(v1)) {
        // Both series have values → comparison (Current vs Baseline)
        value      = Number(v0);
        prev_value = Number(v1);
      } else if (!isFiniteNum(v0) && isFiniteNum(v1)) {
        // Series-0 is null (forecast period) → use Series-1 as the forecast value
        value      = Number(v1);
        prev_value = null;
      } else {
        // Series-0 has value, Series-1 is null → historical actual
        value      = isFiniteNum(v0) ? Number(v0) : 0;
        prev_value = null;
      }

      return { label, value, prev_value, unit: 'USD' };
    });

    return {
      id:    c.chart_id ?? `chart_${i}`,
      type:  chartType,
      title: c.title ?? (chartType === 'Line' ? 'Trend Over Time' : 'Category Breakdown'),
      data,
    };
  });

  // ── Recommendations ───────────────────────────────────────────────
  const recommendations: string[] = ((raw.recommendations as any[]) ?? []).map(
    (r: any) => (typeof r === 'string' ? r : r.action ?? '')
  ).filter(Boolean);

  // ── Summary levels  ───────────────────────────────────────────────
  const rawLevels = (raw.summary_levels as Record<string, string>) ?? {};

  const topMetric = key_metrics[0];
  const trendDir  = (rawTrend.direction as string) ?? 'stable';
  const changePct = Number(rawTrend.change_rate ?? 0);
  const metaLine  = topMetric
    ? `Sales: $${topMetric.value.toLocaleString(undefined, { maximumFractionDigits: 0 })} USD`
    : 'Data processed successfully.';
  const changeStr = changePct !== 0
    ? ` Sales ${trendDir} by ${Math.abs(changePct).toFixed(1)}% vs prior period.`
    : '';

  const simple   = rawLevels.simple   || `${metaLine}.${changeStr} Check the chart for details.`;
  const medium   = rawLevels.medium   || `${metaLine}.${changeStr} Top drivers: ${diagnostics[0] ?? 'see breakdown'}.`;
  const advanced  = rawLevels.advanced || `${metaLine}.${changeStr} ${diagnostics.join(' | ')}`;

  // Normalize query_type: engine may return array or string
  const rawQT = raw.query_type;
  const query_type: string[] = Array.isArray(rawQT)
    ? rawQT.map(String)
    : [String(rawQT ?? 'descriptive')];

  return {
    query_type,
    key_metrics,
    trend,
    breakdown,
    diagnostics,
    prediction,
    comparison,
    chart_data,
    recommendations,
    confidence:     Number(raw.confidence ?? 0.85),
    limitations:    (raw.limitations as string[])    ?? [],
    warnings:       (raw.warnings    as string[])    ?? [],
    summary:        String(raw.summary ?? ''),
    summary_levels: { simple, medium, advanced },
  };
}

// ================================================================
// PERSONA RULES
// Adjusts which chart_data entry is used as primary/secondary
// and merges in persona-appropriate recommendations.
// ================================================================

const PERSONA_CHART_MAP: Record<Persona, Record<string, SuggestedVisual>> = {
  Beginner:   { Diagnostic: 'Bar', Comparative: 'Bar', Descriptive: 'Bar', default: 'Bar' },
  Everyday:   { Diagnostic: 'Waterfall', Comparative: 'DivergingBar', Descriptive: 'Line', default: 'Line' },
  SME:        { Diagnostic: 'Waterfall', Comparative: 'DivergingBar', Descriptive: 'Line', default: 'Bar' },
  Executive:  { Diagnostic: 'Waterfall', Comparative: 'DivergingBar', Descriptive: 'KPI', default: 'KPI' },
  Analyst:    { Diagnostic: 'Waterfall', Comparative: 'DivergingBar', Descriptive: 'Line', default: 'Bar' },
  Compliance: { Diagnostic: 'Table',    Comparative: 'Table',         Descriptive: 'Table', default: 'Table' },
};

function applyPersonaRules(
  ml: MLOutputContract,
  intent: GeminiIntent,
  persona: Persona,
): MLOutputContract {
  const primaryQT = ml.query_type[0] ?? 'Descriptive';
  const secondaryQTs = ml.query_type.slice(1);
  const personaMap = PERSONA_CHART_MAP[persona];

  // If user explicitly requested a chart type, respect it — skip persona rules
  if (intent.explicit_visual_request && intent.suggested_visual !== 'None') {
    const primary = ml.chart_data[0];
    const updatedCharts = primary
      ? [{ ...primary, type: intent.suggested_visual }, ...ml.chart_data.slice(1)]
      : ml.chart_data;
    return { ...ml, chart_data: updatedCharts };
  }

  const targetType = personaMap[primaryQT] ?? personaMap.default ?? 'Bar';

  // Build recommendations from primary AND secondary query types
  const recs = buildRecommendations(persona, primaryQT as any);
  for (const sqt of secondaryQTs) {
    const extras = buildRecommendations(persona, sqt as any);
    for (const e of extras) {
      if (!recs.includes(e)) recs.push(e);
    }
  }

  // Analyst and Compliance always want the breakdown table as secondary
  const needsTable = persona === 'Analyst' || persona === 'Compliance';

  // Build chart_data: override primary chart type, optionally add Table secondary
  const baseCharts = ml.chart_data.map((cd, i) =>
    i === 0 ? { ...cd, type: targetType as SuggestedVisual } : cd
  );

  const finalCharts = needsTable && !baseCharts.some(c => c.type === 'Table')
    ? [
        ...baseCharts,
        {
          id: 'breakdown_table',
          type: 'Table' as SuggestedVisual,
          title: 'Breakdown Detail',
          data: ml.breakdown.length > 0 ? ml.breakdown : ml.key_metrics,
        },
      ]
    : baseCharts;

  return {
    ...ml,
    chart_data: finalCharts,
    recommendations: recs.length > 0 ? recs : ml.recommendations,
  };
}

// ================================================================
// GROQ ENRICHMENT
// Rewrites all three summary_levels per persona tone.
// ================================================================

async function enrichWithGroq(
  ml: MLOutputContract,
  query: string,
  persona: Persona,
  language: string,
): Promise<MLOutputContract> {
  const TONE_GUIDE: Record<Persona, string> = {
    Beginner:   'Warm, simple, everyday analogies. No jargon. Max 1 sentence per level.',
    Everyday:   'Concise and practical. Focus on the useful takeaway. 1-2 sentences.',
    SME:        'Operational language, KPI movement, team-level context. 2 sentences.',
    Executive:  'Impact-first, strategic framing, decision-relevant. 1-2 sentences.',
    Analyst:    'Precise: exact values, comparison basis, time window, deltas. 2 sentences.',
    Compliance: 'Literal, exact, auditable language. Source references. No inference.',
  };

  const metricsSnippet = ml.key_metrics
    .slice(0, 3)
    .map(m => `${m.label}: ${m.value.toLocaleString()} ${m.unit ?? ''} (prev: ${m.prev_value?.toLocaleString() ?? 'N/A'})`)
    .join('; ');

  const systemPrompt = `You are a data storytelling assistant for Talk2Data.
You rewrite analytical summaries for different user personas.
Always reference actual numbers. Respond ONLY with a valid JSON object containing keys: simple, medium, advanced, action_text.
You MUST generate your final narrative response entirely in the language corresponding to this ISO code: [${language}]. Do not output English unless the code is 'en'.`;

  const userPrompt = `The ML backend analyzed the query: "${query}"

Raw summary: "${ml.summary}"
Key metrics: ${metricsSnippet}
Query types: ${ml.query_type.join(', ')}

Active persona: ${persona}
Tone guide: ${TONE_GUIDE[persona]}

Rewrite the three summary levels for this persona's communication style.
Each level must reference actual numbers where possible.

{
  "simple": "1-sentence summary for non-technical audience",
  "medium": "2-sentence summary for business user",
  "advanced": "2-3 sentence precise summary with exact figures",
  "action_text": "One concrete next step for a ${persona} user"
}`;

  const responseText = await groqChat(systemPrompt, userPrompt, true);
  const parsed = JSON.parse(responseText);

  const enrichedRecs = parsed.action_text
    ? [parsed.action_text, ...ml.recommendations.filter(r => r !== parsed.action_text)].slice(0, 5)
    : ml.recommendations;

  return {
    ...ml,
    summary_levels: {
      simple:   parsed.simple   ?? ml.summary_levels.simple,
      medium:   parsed.medium   ?? ml.summary_levels.medium,
      advanced: parsed.advanced ?? ml.summary_levels.advanced,
    },
    recommendations: enrichedRecs,
  };
}

// ================================================================
// RECOMMENDATION ENGINE — per-persona, per-query-type
// ================================================================

function buildRecommendations(persona: Persona, queryType: string): string[] {
  type Entries = { [k: string]: string[]; Default: string[] };

  const recs: Record<Persona, Entries> = {
    Beginner: {
      Descriptive: ['Show me a basic breakdown.', 'What changed recently?'],
      Comparative: ['Why is the second one lower?', 'Show me the differences.'],
      Diagnostic:  ['What is the main cause?', 'Is this something to worry about?'],
      Default:     ['Give me a more detailed view.'],
    },
    Everyday: {
      Descriptive: ['Has this trend continued this week?', 'Show a product breakdown.'],
      Comparative: ['How does this compare to last month?', 'Which one is growing faster?'],
      Diagnostic:  ['What are the top 3 drivers?', 'Did a specific event cause this?'],
      Default:     ['Break this down further.'],
    },
    SME: {
      Descriptive: ['How does this compare to Q3 target?', 'Drill into regional performance.'],
      Comparative: ['Which product line drove the biggest gap?', 'Compare to the industry benchmark.'],
      Diagnostic:  ['Show detailed root cause analysis.', 'Is this variance isolated or structural?'],
      Default:     ['Generate an operational review summary.'],
    },
    Executive: {
      Descriptive: ['Is this tracking against strategic targets?', 'Give me the top-line summary.'],
      Comparative: ['Is this gap structural or a one-time anomaly?', 'How does this affect resource allocation?'],
      Diagnostic:  ['What corrective action is required?', 'Run a Q4 scenario analysis.'],
      Default:     ['Group this by leading indicators.'],
    },
    Analyst: {
      Descriptive: ['Segment this data by dimension.', 'Apply a seasonal adjustment.'],
      Comparative: ['Run a significance test on this delta.', 'Decompose variance by sub-dimension.'],
      Diagnostic:  ['Validate drivers with the alternate model.', 'Check for confounders in the residual.'],
      Default:     ['Show the exact source data table.'],
    },
    Compliance: {
      Descriptive: ['Confirm timestamp matches system-of-record.', 'Extract full audit trail.'],
      Comparative: ['Flag source calculation discrepancies.', 'Cross-reference with policy thresholds.'],
      Diagnostic:  ['Map drivers to the control framework.', 'Verify all contributor calculations.'],
      Default:     ['Show exactly how this was calculated.'],
    },
  };

  const p = recs[persona];
  return (p[queryType] ?? p.Default ?? []) as string[];
}
