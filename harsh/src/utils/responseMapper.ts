import type {
  Persona, NormalizedInsight, RenderedResponse,
  ConfidenceState, ResponseBlock, MetricPoint, QueryType,
} from '../types';

// ================================================================
// CONFIDENCE MAPPING
// ================================================================

function toConfidenceState(score: number): ConfidenceState {
  if (score >= 0.90) return 'Verified';
  if (score >= 0.70) return 'Estimated';
  return 'Transparent';
}

// ================================================================
// PER-PERSONA SIMPLIFICATION TEMPLATES
// Pre-computed fallbacks so confusion-button works even without Gemini.
// ================================================================

function getSimplified(
  type: ResponseBlock['type'],
  content: string,
  persona: Persona,
): string {
  if (type === 'headline') {
    const map: Record<Persona, string> = {
      Beginner: `Think of it like this: the number changed a bit — like spending a little less at the coffee shop this month vs last month.`,
      Everyday: `In short: the metric shifted. Check the chart to see how much and in which direction.`,
      SME: `Operationally: this KPI moved outside expected range. Investigate with your team and align on next steps.`,
      Executive: `Business impact: this variance signals a structural or operational shift that may require reallocation decisions.`,
      Analyst: `Technically: the observed delta represents a statistically meaningful change. Validate against baseline period.`,
      Compliance: `Factual record: adjust value and variance as shown. Source and timestamp verified. Rule threshold check pending.`,
    };
    return map[persona] ?? content;
  }
  if (type === 'insight') {
    const map: Record<Persona, string> = {
      Beginner: `This is useful to know. You don't need to act immediately — just keep an eye on it.`,
      Everyday: `This is worth a quick follow-up. The chart above shows where the change happened.`,
      SME: `The operational reading: check if this aligns with recent workload changes or vendor changes in your team.`,
      Executive: `Strategically, this is a signal to monitor. If sustained, it may require a resource or priority adjustment.`,
      Analyst: `For deeper analysis: decompose by sub-dimension and compare with same-period cohort from prior year.`,
      Compliance: `Review source data and confirm all field-level values match the system-of-record extract before filing.`,
    };
    return map[persona] ?? content;
  }
  return `Simpler explanation: ${content}`;
}

// ================================================================
// PERSONA LABELS
// ================================================================

const PERSONA_LABELS: Record<Persona, string> = {
  Beginner: 'Guided Mode',
  Everyday: 'Quick View',
  SME: 'Ops Mode',
  Executive: 'Executive View',
  Analyst: 'Analyst Mode',
  Compliance: 'Audit/Compliance',
};

// ================================================================
// MAIN BUILDER
// Takes a NormalizedInsight + Persona and builds RenderedResponse.
// Called once on first load, then again instantly when persona changes.
// ================================================================

export function buildResponseFromInsight(
  persona: Persona,
  insight: NormalizedInsight,
): RenderedResponse {
  const confState = toConfidenceState(insight.confidence);
  const queryType = insight.query_type;
  const blocks: ResponseBlock[] = [];

  // === BLOCK 1: HEADLINE ===
  const headlineContent = buildHeadline(persona, insight);
  const headlineBlock: ResponseBlock = {
    type: 'headline',
    content: headlineContent,
    simplified: getSimplified('headline', headlineContent, persona),
  };
  blocks.push(headlineBlock);

  // === BLOCK 2: AUDIT BANNER (Compliance only) ===
  if (persona === 'Compliance') {
    blocks.push({
      type: 'audit',
      content: '[RECORD]',
      auditContent: `Source: ${insight.metadata.source} | Timestamp: ${new Date(insight.metadata.timestamp).toLocaleString()} | Query: "${insight.metadata.query}" | Confidence: ${(insight.confidence * 100).toFixed(1)}%`,
    });
  }

  // === BLOCK 3: PRIMARY CHART ===
  blocks.push({
    type: 'chart',
    content: `Chart: ${insight.chart.primary}`,
    chartData: insight.chart.data,
    chartType: insight.chart.primary,
    simplified: 'This chart shows the key data points visually. Each bar, point, or ring represents a measured value.',
  });

  // === BLOCK 4: SECONDARY CHART (Analyst gets table, SME gets KPI) ===
  if (insight.chart.secondary && insight.chart.secondary_data) {
    blocks.push({
      type: 'secondary_chart',
      content: `Secondary: ${insight.chart.secondary}`,
      chartData: insight.chart.secondary_data,
      chartType: insight.chart.secondary,
      simplified: 'This secondary view provides additional detail to complement the main chart.',
    });
  }

  // === BLOCK 5: INSIGHT ===
  // For Compliance, render as table block; for Analyst both insight + table
  if (persona === 'Compliance') {
    blocks.push({
      type: 'table',
      content: buildInsightText(persona, insight),
      tableData: insight.metrics,
      simplified: getSimplified('insight', '', persona),
    });
  } else {
    const insightContent = buildInsightText(persona, insight);
    blocks.push({
      type: 'insight',
      content: insightContent,
      simplified: getSimplified('insight', insightContent, persona),
    });
  }

  // === BLOCK 6: RECOMMENDATIONS / ACTIONS ===
  const maxRecs = getMaxRecs(persona);
  const recs = insight.recommendations.slice(0, maxRecs);

  for (const rec of recs) {
    if (rec.trim()) {
      blocks.push({
        type: 'action',
        content: rec,
      });
    }
  }

  // === EVIDENCE ===
  const shouldShowFormula = persona === 'Analyst' || persona === 'Compliance' || persona === 'Executive';
  const shouldShowAudit = persona === 'Compliance' || persona === 'Analyst';
  const shouldShowLimitations = persona !== 'Beginner';

  return {
    blocks,
    confidenceLabel: confState,
    suggestedVisual: insight.chart.primary,
    ttsHeadline: headlineContent,
    personaLabel: PERSONA_LABELS[persona],
    queryType,
    evidence: {
      source: insight.metadata.source,
      timestamp: insight.metadata.timestamp,
      confidence: insight.confidence,
      notes: persona === 'Beginner'
        ? 'Using verified data. This is safe to trust.'
        : `Confidence: ${(insight.confidence * 100).toFixed(1)}%. ${insight.limitations.join(' ')}`,
      rawValues: insight.metrics,
      formula: shouldShowFormula ? insight.metadata.formula : undefined,
      auditLog: shouldShowAudit ? insight.metadata.audit_log : undefined,
      filters: persona === 'Analyst' || persona === 'Compliance' ? insight.metadata.filters : undefined,
      limitations: shouldShowLimitations ? insight.limitations : undefined,
    },
    _originalInsight: insight,
  };
}

// ================================================================
// HEADLINE BUILDER — per persona × query type
// ================================================================

function buildHeadline(persona: Persona, insight: NormalizedInsight): string {
  const base = insight.main_summary;
  const qt = insight.query_type;

  if (persona === 'Beginner') return `I checked this for you. ${base}`;
  if (persona === 'Compliance') return `[AUDIT RECORD] ${base}`;
  if (persona === 'Executive') {
    if (qt === 'Descriptive') return `Bottom line: ${base}`;
    if (qt === 'Comparative') return `Key change: ${base}`;
    if (qt === 'Diagnostic') return `Root cause identified: ${base}`;
  }
  if (persona === 'Analyst') return `[${qt.toUpperCase()}] ${base}`;
  return base;
}

// ================================================================
// INSIGHT TEXT BUILDER — per persona × query type
// ================================================================

function buildInsightText(persona: Persona, insight: NormalizedInsight): string {
  const qt = insight.query_type;
  const metric = insight.metrics[0];

  // Use the explicit insight text from Gemini if available
  const enrichedInsight = insight.insight_text ?? '';

  switch (persona) {
    case 'Beginner':
      if (qt === 'Descriptive') return enrichedInsight || 'Things are tracking normally. You don\'t need to take immediate action.';
      if (qt === 'Comparative') return enrichedInsight || 'One value is higher than the other — the chart shows which one is better.';
      if (qt === 'Diagnostic') return enrichedInsight || 'One factor caused most of the change. The chart shows it clearly.';
      return enrichedInsight || 'The information above tells you what\'s happening in simple terms.';

    case 'Everyday':
      if (qt === 'Descriptive') return enrichedInsight || `The current value is tracking at ${metric?.value?.toLocaleString() ?? 'N/A'}. Check the trend to see the direction.`;
      if (qt === 'Comparative') return enrichedInsight || 'The gap between the two periods is shown clearly. The bigger bar is the stronger result.';
      if (qt === 'Diagnostic') return enrichedInsight || 'The top 2-3 drivers are shown. Start with the largest contributor first.';
      return enrichedInsight || 'Review the chart and make a note of any surprises.';

    case 'SME':
      if (qt === 'Descriptive') return enrichedInsight || `KPI is at ${metric?.value?.toLocaleString() ?? 'N/A'}. ${metric?.delta_pct != null ? `${metric.delta_pct.toFixed(1)}% vs previous.` : ''} Review against your Q3 plan target.`;
      if (qt === 'Comparative') return enrichedInsight || 'The period comparison shows a meaningful delta. Identify which team or product line is driving the gap.';
      if (qt === 'Diagnostic') return enrichedInsight || 'The waterfall breaks down each contributing factor. Lead with the largest driver in your next team review.';
      return enrichedInsight || 'Share findings with your team lead for operational alignment.';

    case 'Executive':
      if (qt === 'Descriptive') {
        const gapPct = metric?.delta_pct?.toFixed(1);
        return enrichedInsight || `${gapPct != null ? `${gapPct}% ${Number(gapPct) >= 0 ? 'above' : 'below'} benchmark. ` : ''}Strategic assessment: ${Math.abs(Number(gapPct ?? 0)) > 10 ? 'material variance requiring attention.' : 'within acceptable tolerance.'}`;
      }
      if (qt === 'Comparative') return enrichedInsight || 'Determine if this gap is structural (ongoing) or one-time. Resource reallocation may be warranted.';
      if (qt === 'Diagnostic') return enrichedInsight || 'Root cause is identified. Consider whether this requires an immediate operational response or a strategic adjustment.';
      return enrichedInsight || 'Review strategic implications and assign ownership.';

    case 'Analyst':
      if (qt === 'Descriptive') {
        const vals = insight.metrics.map(m => `${m.label}: ${m.value.toLocaleString()}`).join(' | ');
        return `Exact values — ${vals}. ${insight.metadata.math_details ? `Formula: ${insight.metadata.math_details}` : ''}`;
      }
      if (qt === 'Comparative') {
        const delta = insight.metrics.find(m => m.delta != null);
        return `Delta: ${delta?.delta?.toLocaleString() ?? 'N/A'} (${delta?.delta_pct?.toFixed(2) ?? 'N/A'}%). ${insight.metadata.math_details} Filters: ${insight.metadata.filters ?? 'none'}.`;
      }
      if (qt === 'Diagnostic') return `Driver decomposition: ${insight.breakdown.map(b => `${b.label} = ${b.value.toLocaleString()}`).join(', ')}. ${insight.metadata.math_details}`;
      return `Full dataset: ${JSON.stringify(insight.metrics.slice(0, 5))}`;

    case 'Compliance':
      return `Source: ${insight.metadata.source}. Timestamp: ${new Date(insight.metadata.timestamp).toLocaleString()}. Values as recorded — no inference applied. All figures are literal system-of-record values. ${insight.metadata.math_details ? `Calculation: ${insight.metadata.math_details}` : ''}`;

    default:
      return enrichedInsight || insight.main_summary;
  }
}

// ================================================================
// MAX RECOMMENDATIONS PER PERSONA
// Per spec: Beginner fewer, Analyst maximum
// ================================================================

function getMaxRecs(persona: Persona): number {
  const limits: Record<Persona, number> = {
    Beginner: 1,
    Everyday: 2,
    SME: 3,
    Executive: 2,
    Analyst: 4,
    Compliance: 3,
  };
  return limits[persona] ?? 2;
}

// ================================================================
// PERSONA SWITCHER UTILITY
// Re-renders all existing AI messages with a new persona.
// No API call — pure local transformation.
// ================================================================

export function reRenderWithPersona(
  messages: Array<{ id: string; sender: string; response?: RenderedResponse; rawInsight?: NormalizedInsight; rawQuery?: string }>,
  newPersona: Persona,
): Array<Pick<{ id: string; response: RenderedResponse }, 'id' | 'response'>> {
  return messages
    .filter(m => m.sender === 'ai' && m.rawInsight)
    .map(m => {
      const updatedInsight: NormalizedInsight = {
        ...m.rawInsight!,
        persona: newPersona,
        chart: resolveChartForPersona(m.rawInsight!, newPersona),
        recommendations: m.rawInsight!.recommendations, // Keep enriched recs
      };
      const newResponse = buildResponseFromInsight(newPersona, updatedInsight);
      return { id: m.id, response: newResponse };
    });
}

// Re-computes chart selection when persona changes (mirrors insightAdapter logic)
function resolveChartForPersona(
  insight: NormalizedInsight,
  persona: Persona,
): NormalizedInsight['chart'] {
  const qt = insight.query_type;
  let primary = insight.chart.primary;
  let secondary = insight.chart.secondary;
  let secondaryData = insight.chart.secondary_data;
  const baseData = insight.chart.data;

  // If the original query had an explicit user-requested chart type,
  // preserve it as primary across persona switches. Only update the secondary.
  const wasExplicit = !!(insight as any)._wasExplicitVisualRequest;
  const userRequestedChart = wasExplicit ? primary : null;

  if (wasExplicit) {
    // Keep the user's chart, only add/remove secondary based on new persona
    if (persona === 'Analyst' || persona === 'Compliance') {
      secondary = 'Table'; secondaryData = baseData;
    } else {
      secondary = null; secondaryData = null;
    }
    return { primary: userRequestedChart!, secondary, data: baseData, secondary_data: secondaryData };
  }

  // Default persona rules (no explicit user chart request)
  if (persona === 'Beginner') {
    if (qt === 'Diagnostic' || qt === 'Comparative') primary = 'Bar';
    secondary = null; secondaryData = null;
  } else if (persona === 'Everyday') {
    if (qt === 'Diagnostic') primary = 'Waterfall';
    secondary = null; secondaryData = null;
  } else if (persona === 'SME') {
    if (qt === 'Diagnostic') primary = 'Waterfall';
    if (qt === 'Descriptive') { secondary = 'KPI'; secondaryData = baseData.slice(0, 1); }
    else { secondary = null; secondaryData = null; }
  } else if (persona === 'Executive') {
    if (qt === 'Descriptive') primary = 'KPI';
    if (qt === 'Comparative') primary = 'DivergingBar';
    if (qt === 'Diagnostic') primary = 'Waterfall';
    secondary = null; secondaryData = null;
  } else if (persona === 'Analyst') {
    if (qt === 'Diagnostic') primary = 'Waterfall';
    if (qt === 'Comparative') primary = 'DivergingBar';
    secondary = 'Table'; secondaryData = baseData;
  } else if (persona === 'Compliance') {
    primary = 'Table'; secondary = null; secondaryData = null;
  }

  return { primary, secondary, data: baseData, secondary_data: secondaryData };
}
