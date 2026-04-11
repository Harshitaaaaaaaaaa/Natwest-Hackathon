/**
 * RESPONSE MAPPER v2
 *
 * Consumes MLOutputContract directly and produces a RenderedResponse
 * shaped for the active persona.
 *
 * Key improvements:
 *  - summary_levels drive the headline (simple/medium/advanced)
 *  - chart_data[0] is primary, chart_data[1] is secondary
 *  - diagnostics rendered as anomaly pills
 *  - recommendations come from ML contract (already persona-shaped by insightAdapter)
 *  - reRenderWithPersona re-applies these rules instantly with no API call
 */

import type {
  Persona, MLOutputContract, RenderedResponse,
  ConfidenceState, ResponseBlock, EvidenceData,
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
// PERSONA LABELS
// ================================================================

const PERSONA_LABELS: Record<Persona, string> = {
  Beginner:   'Guided Mode',
  Everyday:   'Quick View',
  SME:        'Ops Mode',
  Executive:  'Executive View',
  Analyst:    'Analyst Mode',
  Compliance: 'Audit/Compliance',
};

// ================================================================
// SUMMARY LEVEL SELECTOR
// Picks from the three pre-computed summary_level strings.
// ================================================================

function pickSummary(persona: Persona, ml: MLOutputContract): string {
  const { simple, medium, advanced } = ml.summary_levels;
  if (persona === 'Beginner' || persona === 'Everyday') return simple;
  if (persona === 'SME' || persona === 'Executive')     return medium;
  return advanced; // Analyst, Compliance
}

// ================================================================
// INSIGHT TEXT — adds persona context on top of the summary
// ================================================================

function buildInsightText(persona: Persona, ml: MLOutputContract): string {
  const primary = ml.key_metrics[0];
  const qt = ml.query_type[0] ?? 'Descriptive';

  switch (persona) {
    case 'Beginner':
      return ml.diagnostics[0]
        ? `Here's the key finding: ${ml.diagnostics[0]}`
        : 'Things look mostly normal. Keep an eye on the chart.';

    case 'Everyday':
      return primary
        ? `${primary.label} is at ${primary.value.toLocaleString()} ${primary.unit ?? ''}. ${ml.diagnostics[0] ?? ''}`
        : 'Review the chart and act on the biggest bar.';

    case 'SME':
      if (qt === 'Diagnostic') {
        return `Drivers: ${ml.diagnostics.slice(0, 2).join(' | ')}. Align with your team on the largest contributor.`;
      }
      return primary
        ? `KPI: ${primary.label} at ${primary.value.toLocaleString()} ${primary.unit ?? ''} (${primary.delta_pct != null ? `${primary.delta_pct.toFixed(1)}% vs prior` : 'baseline'}). Review against plan.`
        : 'Check the breakdown against your operational targets.';

    case 'Executive':
      if (qt === 'Diagnostic') return `Root cause: ${ml.diagnostics[0] ?? 'identified in chart.'}. Evaluate corrective action.`;
      if (primary?.delta_pct != null) {
        const dir = primary.delta_pct >= 0 ? 'above' : 'below';
        return `${Math.abs(primary.delta_pct).toFixed(1)}% ${dir} prior — ${Math.abs(primary.delta_pct) > 10 ? 'material variance requiring attention.' : 'within acceptable tolerance.'}`;
      }
      return 'Review strategic implications and assign ownership.';

    case 'Analyst': {
      const vals = ml.key_metrics.map(m => `${m.label}: ${m.value.toLocaleString()} ${m.unit ?? ''}`).join(' | ');
      const delta = primary?.delta != null
        ? `  Δ = ${primary.value.toLocaleString()} − ${(primary.prev_value ?? 0).toLocaleString()} = ${primary.delta.toLocaleString()} (${primary.delta_pct?.toFixed(2) ?? '?'}%)`
        : '';
      return `${vals}.${delta} Diagnostics: ${ml.diagnostics.join('; ')}`;
    }

    case 'Compliance':
      return `Source: ML Analytics Engine | Timestamp: ${new Date().toLocaleString()} | Confidence: ${(ml.confidence * 100).toFixed(1)}%. Values are literal system-of-record outputs. ${ml.limitations.join(' ')}`;

    default:
      return ml.summary;
  }
}

// ================================================================
// SIMPLIFIED EXPLANATIONS (pre-computed fallback for confusion btn)
// ================================================================

function getSimplified(type: ResponseBlock['type'], persona: Persona): string {
  if (type === 'headline') {
    const m: Record<Persona, string> = {
      Beginner:   'Think of it like a monthly bank statement — this is the summary line.',
      Everyday:   'The key takeaway is above. Click the chart to dig deeper.',
      SME:        'This KPI represents operational performance against your team target.',
      Executive:  'This is the strategic signal — review for allocation implications.',
      Analyst:    'This delta is statistically meaningful. Validate against the baseline period.',
      Compliance: 'Factual record as per system output. Timestamp and source verified.',
    };
    return m[persona] ?? '';
  }
  if (type === 'insight') {
    const m: Record<Persona, string> = {
      Beginner:   "You don't need to act immediately — just keep an eye on this.",
      Everyday:   'Worth a quick follow-up. The chart shows where the change happened.',
      SME:        'Check if this aligns with recent workload or vendor changes.',
      Executive:  'If sustained, this may require a resource or priority adjustment.',
      Analyst:    'Decompose by sub-dimension and compare with same-period cohort from prior year.',
      Compliance: 'Confirm all field-level values match the system-of-record extract before filing.',
    };
    return m[persona] ?? '';
  }
  return '';
}

// ================================================================
// MAX RECOMMENDATIONS PER PERSONA
// ================================================================

function getMaxRecs(persona: Persona): number {
  return { Beginner: 1, Everyday: 2, SME: 3, Executive: 2, Analyst: 4, Compliance: 3 }[persona] ?? 2;
}

// ================================================================
// MAIN BUILDER
// ================================================================

export function buildResponseFromInsight(
  persona: Persona,
  ml: MLOutputContract,
): RenderedResponse {
  const confState = toConfidenceState(ml.confidence);
  const blocks: ResponseBlock[] = [];
  const headlineContent = pickSummary(persona, ml);

  // ── BLOCK 1: HEADLINE ────────────────────────────────────────────
  blocks.push({
    type: 'headline',
    content: persona === 'Beginner' ? `I checked this for you. ${headlineContent}` :
             persona === 'Compliance' ? `[AUDIT RECORD] ${headlineContent}` :
             persona === 'Executive' ? `Bottom line: ${headlineContent}` :
             headlineContent,
    simplified: getSimplified('headline', persona),
  });

  // ── BLOCK 2: AUDIT BANNER (Compliance only) ─────────────────────
  if (persona === 'Compliance') {
    blocks.push({
      type: 'audit',
      content: '[RECORD]',
      auditContent: `Source: ML Analytics Engine | Timestamp: ${new Date().toLocaleString()} | Confidence: ${(ml.confidence * 100).toFixed(1)}% | Warnings: ${ml.warnings.join(', ') || 'None'}`,
    });
  }

  // ── BLOCK 3: PRIMARY CHART from chart_data[0] ───────────────────
  const primaryChart = ml.chart_data[0];
  if (primaryChart && primaryChart.type !== 'None') {
    blocks.push({
      type: 'chart',
      content: `${primaryChart.title ?? primaryChart.type}`,
      chartData: primaryChart.data,
      chartType: primaryChart.type,
      simplified: 'Each bar, point, or segment represents a measured value from your data.',
    });
  }

  // ── BLOCK 4: SECONDARY CHART from chart_data[1] ────────────────
  const secondaryChart = ml.chart_data[1];
  if (secondaryChart && (persona === 'Analyst' || persona === 'Compliance' || persona === 'SME')) {
    blocks.push({
      type: 'secondary_chart',
      content: `${secondaryChart.title ?? secondaryChart.type}`,
      chartData: secondaryChart.data,
      chartType: secondaryChart.type,
      simplified: 'This secondary view provides additional breakdown detail.',
    });
  }

  // ── BLOCK 5: KPI STRIP (Executive / SME) ───────────────────────
  if ((persona === 'Executive' || persona === 'SME') && ml.key_metrics.length > 0) {
    blocks.push({
      type: 'kpi',
      content: ml.key_metrics.map(m => `${m.label}: ${m.value.toLocaleString()} ${m.unit ?? ''}`).join(' · '),
      chartData: ml.key_metrics,
      chartType: 'KPI',
    });
  }

  // ── BLOCK 6: INSIGHT TEXT ───────────────────────────────────────
  if (persona === 'Compliance') {
    blocks.push({
      type: 'table',
      content: buildInsightText(persona, ml),
      tableData: ml.key_metrics,
      simplified: getSimplified('insight', persona),
    });
  } else {
    const insightContent = buildInsightText(persona, ml);
    blocks.push({
      type: 'insight',
      content: insightContent,
      simplified: getSimplified('insight', persona),
    });
  }

  // ── BLOCK 7: DIAGNOSTICS / ANOMALIES (non-Beginner) ────────────
  if (persona !== 'Beginner' && ml.diagnostics.length > 0) {
    const maxDiag = persona === 'Analyst' || persona === 'Compliance' ? 5 : 2;
    for (const diag of ml.diagnostics.slice(0, maxDiag)) {
      blocks.push({ type: 'audit', content: `⚑ ${diag}`, auditContent: diag });
    }
  }

  // ── BLOCK 8: RECOMMENDATIONS ────────────────────────────────────
  const maxRecs = getMaxRecs(persona);
  for (const rec of ml.recommendations.slice(0, maxRecs)) {
    if (rec.trim()) blocks.push({ type: 'action', content: rec });
  }

  // ── EVIDENCE ────────────────────────────────────────────────────
  const shouldShowFormula  = persona === 'Analyst' || persona === 'Compliance' || persona === 'Executive';
  const shouldShowAudit    = persona === 'Compliance' || persona === 'Analyst';
  const shouldShowLimits   = persona !== 'Beginner';

  const primaryMetric = ml.key_metrics[0];
  const formula = primaryMetric?.delta != null
    ? `Δ = ${primaryMetric.value.toLocaleString()} − ${(primaryMetric.prev_value ?? 0).toLocaleString()} = ${primaryMetric.delta.toLocaleString()} (${primaryMetric.delta_pct?.toFixed(1)}%)`
    : undefined;

  const evidence: EvidenceData = {
    source:     'ML Analytics Engine',
    timestamp:  new Date().toISOString(),
    confidence: ml.confidence,
    notes: persona === 'Beginner'
      ? 'Using verified data. Safe to trust.'
      : `Confidence: ${(ml.confidence * 100).toFixed(1)}%. ${ml.limitations.join(' ')}`,
    rawValues:   ml.key_metrics,
    formula:     shouldShowFormula  ? formula                                    : undefined,
    auditLog:    shouldShowAudit    ? `[AUDIT] ${new Date().toISOString()} | query processed by ML engine | persona=${persona}` : undefined,
    filters:     shouldShowAudit    ? `query_type=${ml.query_type.join('+')} | persona=${persona}` : undefined,
    limitations: shouldShowLimits   ? ml.limitations                             : undefined,
  };

  return {
    blocks,
    confidenceLabel: confState,
    personaLabel:    PERSONA_LABELS[persona],
    queryType:       ml.query_type,
    ttsHeadline:     headlineContent,
    suggestedVisual: primaryChart?.type,
    evidence,
    _originalInsight: ml,
    _persona: persona,
  };
}

// ================================================================
// PERSONA SWITCHER UTILITY
// Re-renders all existing AI messages instantly — no new API call.
// ================================================================

export function reRenderWithPersona(
  messages: Array<{ id: string; sender: string; response?: RenderedResponse; rawInsight?: MLOutputContract }>,
  newPersona: Persona,
): Array<Pick<{ id: string; response: RenderedResponse }, 'id' | 'response'>> {
  return messages
    .filter(m => m.sender === 'ai' && m.rawInsight)
    .map(m => ({
      id: m.id,
      response: buildResponseFromInsight(newPersona, m.rawInsight!),
    }));
}
