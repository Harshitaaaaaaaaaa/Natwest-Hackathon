/**
 * LLM SERVICE (Groq) — Intent classification, block simplification, conversational handler.
 * Uses the Groq REST API (OpenAI-compatible) with llama-3.3-70b-versatile.
 */

import type { GeminiIntent, Persona } from '../types';

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

const FALLBACK_INTENT: GeminiIntent = {
  query_type: ['Descriptive'],
  metric: 'General',
  persona_tone: 'Supportive',
  suggested_visual: 'Bar',
  confidence_score: 0.5,
  user_goal: 'Understand current status',
  next_action: 'Review details below',
};

// ================================================================
// INTENT CLASSIFICATION
// Returns a GeminiIntent that drives chart selection and response shaping.
// ================================================================

export async function classifyIntent(query: string, persona: Persona): Promise<GeminiIntent> {
  if (!GROQ_API_KEY) {
    console.warn('[llmService] No Groq API key — using keyword fallback.');
    return fallbackClassify(query);
  }

  try {
    const systemPrompt = `You are an intent classifier for a Talk-to-Data enterprise analytics system.
The user is asking a data question. The current user persona is: ${persona}.

Persona descriptions:
- Beginner: needs simple charts (Gauge, Bar, Sparkline). Avoid complex visuals.
- Everyday: practical user. Prefers Line, Bar, KPI cards.
- SME: business/team user. Prefers trend lines, diverging bars, waterfall.
- Executive: strategic user. Prefers KPI, Bullet chart, Waterfall, DivergingBar.
- Analyst: power user. Wants exact data, Scatter, Table, Waterfall with decomposition.
- Compliance: audit user. Prefers Table and traceable log formats.

Query types:
- Descriptive: what is the current state, status, trend, summary.
- Comparative: compare two periods, groups, entities, or options.
- Diagnostic: why did something happen, root cause, drivers, contributors.
- Conversational: greeting, chit-chat, meta-questions about the AI or system, off-topic or general assistance questions that DO NOT require data charts.

Visual options: Gauge | Line | Bar | DivergingBar | Waterfall | Table | Sparkline | Treemap | Bullet | KPI | Pie | Scatter | StackedBar | None

IMPORTANT: A query can belong to MULTIPLE categories. For example:
- "What were the sales last month and why did they drop?" → ["Descriptive", "Diagnostic"]
- "Compare regions and show the trend" → ["Comparative", "Descriptive"]
- A simple greeting → ["Conversational"]

You MUST respond with ONLY a valid JSON object with these exact keys:
{
  "query_type": ["array of applicable types from: Descriptive, Comparative, Diagnostic, Conversational, Unknown"],
  "metric": "specific metric name detected, or 'General'",
  "persona_tone": "Supportive | Efficient | Analytical | Authoritative | Forensic | Strategic",
  "suggested_visual": "best chart type for the PRIMARY query type and persona. Use 'None' for Conversational.",
  "confidence_score": 0.95,
  "user_goal": "brief description of what the user is trying to achieve",
  "next_action": "short suggestion for what to do next"
}`;

    const responseText = await groqChat(systemPrompt, `User Query: "${query}"`, true);
    const parsed = JSON.parse(responseText);
    if (parsed.query_type && parsed.suggested_visual) {
      // Normalize: if LLM returned a single string, wrap it in an array
      if (typeof parsed.query_type === 'string') {
        parsed.query_type = [parsed.query_type];
      }
      return parsed as GeminiIntent;
    }
    throw new Error('Invalid schema from Groq');
  } catch (err) {
    console.error('[llmService] classifyIntent failed:', err);
    return fallbackClassify(query);
  }
}

// ================================================================
// KEYWORD FALLBACK (no API key or Groq error)
// Maps common query patterns to intent + visual
// ================================================================

// Detect if the user explicitly named a chart type in their query.
// When true, persona-default visual overrides are skipped so the user gets what they asked for.
function detectExplicitVisual(q: string): GeminiIntent['suggested_visual'] | null {
  if (q.includes('pie chart') || q.includes('pie graph') || /\bpie\b/.test(q)) return 'Pie';
  if (q.includes('donut') || q.includes('doughnut')) return 'Pie';
  if (q.includes('treemap') || q.includes('tree map')) return 'Treemap';
  if (q.includes('waterfall')) return 'Waterfall';
  if (q.includes('scatter') || q.includes('scatter plot')) return 'Scatter';
  if (q.includes('gauge')) return 'Gauge';
  if (q.includes('bullet chart') || q.includes('bullet graph')) return 'Bullet';
  if (q.includes('kpi') || q.includes('kpi card')) return 'KPI';
  if (q.includes('bar chart') || q.includes('bar graph') || /\bbar\b/.test(q)) return 'Bar';
  if (q.includes('line chart') || q.includes('line graph') || /\bline chart\b/.test(q)) return 'Line';
  if (q.includes('stacked') || q.includes('stacked bar')) return 'StackedBar';
  return null;
}

function fallbackClassify(query: string): GeminiIntent {
  const q = query.toLowerCase();
  const types: Set<string> = new Set();
  let visual = FALLBACK_INTENT.suggested_visual;
  let metric = 'performance';

  // === EXPLICIT CHART REQUEST — takes highest priority ===
  const explicitVisual = detectExplicitVisual(q);
  if (explicitVisual) {
    visual = explicitVisual;
    // Composition charts imply descriptive
    if (explicitVisual === 'Pie' || explicitVisual === 'Treemap') types.add('Descriptive');
    if (types.size === 0) types.add('Descriptive');
    // Return early with explicit flag so persona overrides are skipped
    return {
      ...FALLBACK_INTENT,
      query_type: [...types] as GeminiIntent['query_type'],
      suggested_visual: visual,
      metric: detectMetric(q),
      confidence_score: 0.70,
      explicit_visual_request: true,
    };
  }

  // ── Multi-type detection — accumulate all applicable categories ──
  const isConversational =
    /^(hi|hey|hello)\b/.test(q) ||
    q.includes('how are you') ||
    q.includes('who are you') ||
    q.includes('help') ||
    /what.*can you/.test(q) ||
    /what.*questions/.test(q) ||
    /can.*i ask/.test(q) ||
    q.includes('thank');

  if (isConversational) {
    return {
      ...FALLBACK_INTENT,
      query_type: ['Conversational'],
      suggested_visual: 'None',
      metric,
      confidence_score: 0.65,
      explicit_visual_request: false,
    };
  }

  // Diagnostic signals
  if (q.includes('why') || q.includes('driver') || q.includes('cause') || q.includes('spike') || q.includes('drop') || q.includes('declined') || q.includes('root cause')) {
    types.add('Diagnostic'); visual = 'Waterfall';
  }

  // Comparative signals
  if (q.includes('vs') || q.includes('versus') || q.includes('compare') || q.includes('difference') || q.includes('better') || q.includes('higher') || q.includes('lower')) {
    types.add('Comparative'); visual = types.has('Diagnostic') ? 'Waterfall' : 'DivergingBar';
  }

  // Descriptive signals
  if (q.includes('trend') || q.includes('over time') || q.includes('quarter') || q.includes('month') ||
      q.includes('breakdown') || q.includes('composition') || q.includes('share') || q.includes('split') ||
      q.includes('status') || q.includes('current') || q.includes('today') || q.includes('now') ||
      q.includes('total') || q.includes('show') || q.includes('what')) {
    types.add('Descriptive');
    if (!types.has('Diagnostic') && !types.has('Comparative')) {
      if (q.includes('trend') || q.includes('over time') || q.includes('month')) visual = 'Line';
      else if (q.includes('breakdown') || q.includes('composition') || q.includes('share')) visual = 'Pie';
      else if (q.includes('status') || q.includes('current') || q.includes('today')) visual = 'KPI';
    }
  }

  // Default to Descriptive if nothing matched
  if (types.size === 0) types.add('Descriptive');

  // Metric detection
  if (q.includes('revenue') || q.includes('sales')) metric = 'revenue';
  else if (q.includes('cost') || q.includes('spending') || q.includes('expense')) metric = 'cost';
  else if (q.includes('churn') || q.includes('retention')) metric = 'churn';
  else if (q.includes('profit') || q.includes('margin')) metric = 'profit';
  else if (q.includes('user') || q.includes('customer')) metric = 'customer count';

  return {
    ...FALLBACK_INTENT,
    query_type: [...types] as GeminiIntent['query_type'],
    suggested_visual: visual,
    metric,
    confidence_score: 0.65,
    explicit_visual_request: false,
  };
}

function detectMetric(q: string): string {
  if (q.includes('revenue') || q.includes('sales')) return 'revenue';
  if (q.includes('cost') || q.includes('spending') || q.includes('expense')) return 'cost';
  if (q.includes('churn') || q.includes('retention')) return 'churn';
  if (q.includes('profit') || q.includes('margin')) return 'profit';
  if (q.includes('user') || q.includes('customer')) return 'customer count';
  return 'performance';
}

// ================================================================
// BLOCK SIMPLIFIER (for "?" confusion button on response blocks)
// Receives full data context so Groq can explain real numbers.
// ================================================================

export interface SimplifyContext {
  query: string;
  mainSummary: string;
  metrics: Array<{ label: string; value: number; prev_value: number | null; unit?: string }>;
  breakdown?: Array<{ label: string; value: number }>;
  anomalies?: string[];
  trendDirection?: string;
}

export async function simplifyBlock(
  blockContent: string,
  blockType: string,
  persona: Persona,
  context?: SimplifyContext,
): Promise<string> {
  const STYLE_GUIDE: Record<Persona, string> = {
    Beginner: 'Use a simple everyday analogy (coffee shops, traffic, grocery shopping). Be warm and reassuring. Max 2 sentences.',
    Everyday: 'Use a clear, practical real-world example. Keep it short and useful. 1-2 sentences.',
    SME: 'Use a workflow or team-level business example. Mention the specific change and what team should do next. 2 sentences.',
    Executive: 'Frame in terms of business impact, risk, and strategic opportunity. Be decisive. One sentence.',
    Analyst: 'Give a factual breakdown referencing exact values and the underlying arithmetic logic. 2 sentences.',
    Compliance: 'Give a literal, auditable explanation referencing exact values and sources. No inference.',
  };

  // ── Build a smart fallback from data even when Groq is unavailable ──
  const smartFallback = (): string => {
    if (!context) return `Here is what this means: ${blockContent}`;

    const primary = context.metrics[0];
    const hasDelta = primary?.prev_value != null;
    const direction = hasDelta && primary
      ? primary.value > (primary.prev_value ?? 0) ? 'went up' : 'went down'
      : null;

    if (blockType === 'headline' || blockType === 'insight') {
      if (hasDelta && primary && direction) {
        const change = Math.abs(primary.value - (primary.prev_value ?? 0));
        return `${primary.label} ${direction} by ${change.toLocaleString()} ${primary.unit ?? ''}. That is the key change behind this insight.`;
      }
      return context.mainSummary;
    }

    if (blockType === 'action') {
      return `Given that ${context.mainSummary.toLowerCase()}, this step helps you respond to that change directly.`;
    }

    if (blockType === 'chart') {
      const cats = context.breakdown?.slice(0, 3).map(b => `${b.label}: ${b.value.toLocaleString()}`).join(', ');
      return cats
        ? `The chart shows where your numbers come from — the biggest contributors are: ${cats}.`
        : `The chart shows your data visually. The taller/wider the bar, the bigger that category.`;
    }

    return `In simple terms: ${blockContent}`;
  };

  if (!GROQ_API_KEY) return smartFallback();

  // ── Format context for Groq ─────────────────────────────────────
  const metricsText = context?.metrics?.map(m => {
    const delta = m.prev_value != null ? ` (was ${m.prev_value.toLocaleString()} ${m.unit ?? ''}, changed by ${(m.value - m.prev_value).toLocaleString()})` : '';
    return `• ${m.label}: ${m.value.toLocaleString()} ${m.unit ?? ''}${delta}`;
  }).join('\n') ?? 'No specific metrics available.';

  const breakdownText = context?.breakdown?.length
    ? context.breakdown.map(b => `• ${b.label}: ${b.value.toLocaleString()}`).join('\n')
    : null;

  const anomalyText = context?.anomalies?.length
    ? context.anomalies.join('; ')
    : null;

  try {
    const systemPrompt = `You are a data simplification assistant for Talk2Data.
A user clicked "Help me understand" on a specific block inside a data analysis response.
User persona: ${persona} — ${STYLE_GUIDE[persona]}
Explain the block text in 2-3 sentences. Reference actual numbers. Do NOT repeat the block text. Adapt tone to the persona. Reply with ONLY the explanation text.`;

    const userPrompt = `=== USER'S ORIGINAL QUESTION ===
"${context?.query ?? 'a data question'}"

=== ANALYSIS FOUND ===
${context?.mainSummary ?? blockContent}

=== KEY METRICS ===
${metricsText}

${breakdownText ? `=== BREAKDOWN ===\n${breakdownText}\n` : ''}
${anomalyText ? `=== ANOMALIES ===\n${anomalyText}\n` : ''}

=== BLOCK TO EXPLAIN ===
Type: ${blockType}
Text: "${blockContent}"`;

    const text = await groqChat(systemPrompt, userPrompt);
    return text || smartFallback();
  } catch (err) {
    console.error('[simplifyBlock] Groq call failed:', err);
    return smartFallback();
  }
}

// ================================================================
// CONVERSATIONAL HANDLER
// Directly responds to greetings and meta-questions via Groq
// ================================================================

export async function handleConversationalQuery(query: string, persona: Persona, language: string): Promise<string> {
  const fallback = "Hello! I am your Talk2Data assistant. I can analyze revenue, costs, churn, and answer deep operational questions. What can I look up for you today?";
  
  if (!GROQ_API_KEY) return fallback;

  try {
    const systemPrompt = `You are the Talk2Data enterprise AI assistant.
The active interface persona is: ${persona}.
Your goal is to answer data questions for the user.
Respond nicely and conversationally in 1-2 sentences.
Remind the user gently that you can plot charts, run diagnostics, and compare periods.
Do NOT use markdown. Do NOT use fake data. Reply as an AI assistant.
You MUST generate your final narrative response entirely in the language corresponding to this ISO code: [${language}]. Do not output English unless the code is 'en'.`;

    const text = await groqChat(systemPrompt, `The user just said: "${query}"`);
    return text || fallback;
  } catch (err) {
    console.error('[handleConversationalQuery] Groq failed:', err);
    return fallback;
  }
}
