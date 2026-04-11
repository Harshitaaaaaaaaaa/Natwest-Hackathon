/**
 * INSIGHT ADAPTER v2
 *
 * The adapter now works directly with MLOutputContract — no normalization
 * layer needed since mock data already conforms to the contract.
 *
 * Flow:
 *   1. fetchMLSample(intent)       → MLOutputContract (mock or real API)
 *   2. applyPersonaRules(ml, ...)  → personalized chart_data selection
 *   3. enrichWithGemini(ml, ...)   → summary_levels rewritten per persona
 *
 * The returned MLOutputContract feeds directly into responseMapper.
 */

import type { GeminiIntent, MLOutputContract, Persona, SuggestedVisual } from '../types';
import { fetchMLSample } from './mockDataService';
import { GoogleGenerativeAI } from '@google/generative-ai';

const REAL_API_URL = import.meta.env.VITE_ML_API_URL || '';
const API_KEY = import.meta.env.VITE_GEMINI_API_KEY || '';

// ================================================================
// PUBLIC ENTRY POINT
// ================================================================

export async function getInsightResponse(
  query: string,
  intent: GeminiIntent,
  persona: Persona,
): Promise<MLOutputContract> {
  let ml: MLOutputContract;

  if (REAL_API_URL) {
    try {
      ml = await fetchFromRealAPI(query, intent, persona);
    } catch (err) {
      console.warn('[insightAdapter] Real API unavailable, using mock:', err);
      ml = await fetchFromMock(intent);
    }
  } else {
    ml = await fetchFromMock(intent);
  }

  // Apply persona-specific chart selection rules
  ml = applyPersonaRules(ml, intent, persona);

  // Optionally enrich summary_levels with Gemini (non-blocking)
  if (API_KEY) {
    try {
      ml = await enrichWithGemini(ml, query, persona);
    } catch {
      // Gemini enrichment failed — use pre-generated summary_levels as-is
    }
  }

  return ml;
}

// ================================================================
// REAL API PATH
// ================================================================

async function fetchFromRealAPI(
  query: string,
  intent: GeminiIntent,
  persona: Persona,
): Promise<MLOutputContract> {
  const response = await fetch(`${REAL_API_URL}/insight`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, intent, persona }),
  });
  if (!response.ok) throw new Error(`ML API error: ${response.status}`);
  return response.json() as Promise<MLOutputContract>;
}

// ================================================================
// MOCK PATH
// ================================================================

async function fetchFromMock(intent: GeminiIntent): Promise<MLOutputContract> {
  return fetchMLSample(intent);
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

  // Get richer chart recommendations per persona
  const recs = buildRecommendations(persona, primaryQT as any);

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
// GEMINI ENRICHMENT
// Rewrites all three summary_levels per persona tone.
// ================================================================

async function enrichWithGemini(
  ml: MLOutputContract,
  query: string,
  persona: Persona,
): Promise<MLOutputContract> {
  const TONE_GUIDE: Record<Persona, string> = {
    Beginner:   'Warm, simple, everyday analogies. No jargon. Max 1 sentence per level.',
    Everyday:   'Concise and practical. Focus on the useful takeaway. 1-2 sentences.',
    SME:        'Operational language, KPI movement, team-level context. 2 sentences.',
    Executive:  'Impact-first, strategic framing, decision-relevant. 1-2 sentences.',
    Analyst:    'Precise: exact values, comparison basis, time window, deltas. 2 sentences.',
    Compliance: 'Literal, exact, auditable language. Source references. No inference.',
  };

  const genAI = new GoogleGenerativeAI(API_KEY);
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: { responseMimeType: 'application/json' },
  });

  const metricsSnippet = ml.key_metrics
    .slice(0, 3)
    .map(m => `${m.label}: ${m.value.toLocaleString()} ${m.unit ?? ''} (prev: ${m.prev_value?.toLocaleString() ?? 'N/A'})`)
    .join('; ');

  const prompt = `
You are a data storytelling assistant for Talk2Data.
The ML backend returned a data analysis for the query: "${query}"

Raw summary: "${ml.summary}"
Key metrics: ${metricsSnippet}
Query types: ${ml.query_type.join(', ')}

Active persona: ${persona}
Tone guide: ${TONE_GUIDE[persona]}

Rewrite the three summary levels for this persona's communication style.
Each level must reference actual numbers where possible.

Respond ONLY with:
{
  "simple": "1-sentence summary for non-technical audience",
  "medium": "2-sentence summary for business user",
  "advanced": "2-3 sentence precise summary with exact figures",
  "action_text": "One concrete next step for a ${persona} user"
}
`;

  const result = await model.generateContent(prompt);
  const parsed = JSON.parse(result.response.text().trim());

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
