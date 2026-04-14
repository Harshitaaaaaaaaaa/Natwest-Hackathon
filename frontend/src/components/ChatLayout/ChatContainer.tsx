import React, { useRef, useEffect } from 'react';
import { useAppContext } from '../../stores/appStore';
import { ChatInput } from './ChatInput';
import { MessageBubble } from './MessageBubble';
import { buildResponseFromInsight } from '../../utils/responseMapper';
import type { MLOutputContract, MetricPoint, ChartDataContract } from '../../types';
import { buildApiUrl } from '../../config/api';

/**
 * Adapts the raw Superstore execution engine response into the strict
 * MLOutputContract shape the responseMapper and MessageBubble expect.
 */
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
  const breakdown: MetricPoint[] = [
    ...(rawBreakdown.category ?? []),
    ...(rawBreakdown.merchant ?? []),
  ].map((b: any) => ({
    label:      b.label ?? '',
    value:      b.value ?? 0,
    unit:       'USD',
    prev_value: null,
    category:   b.percentage != null ? `${b.percentage}%` : undefined,
  }));

  // ── Diagnostics → string array ────────────────────────────────────
  const rawDiag = (raw.diagnostics as { causes?: any[]; anomalies?: any[] }) ?? {};
  const diagnostics: string[] = [
    ...(rawDiag.causes ?? []).map((c: any) =>
      `${c.cause}: ${c.direction ?? ''} (${c.contribution_pct ?? c.impact ?? ''}%) — ${c.evidence ?? ''}`
    ),
    ...(rawDiag.anomalies ?? []).map((a: any) =>
      `Anomaly: ${a.label} = ${a.value} on ${a.date} [${a.severity}]`
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
    // Determine chart type
    const typeMap: Record<string, any> = {
      line: 'Line', bar: 'Bar', pie: 'Pie', scatter: 'Scatter',
    };
    const chartType = typeMap[c.chart_type?.toLowerCase?.()] ?? 'Bar';

    // Build data points from x_axis + series
    const xAxis: string[] = c.x_axis ?? [];
    const firstSeries = (c.series ?? [])[0] ?? {};
    const values: number[] = firstSeries.values ?? [];

    const data: MetricPoint[] = xAxis.map((label: string, idx: number) => ({
      label,
      value:      values[idx] ?? 0,
      prev_value: null,
      unit:       'USD',
    }));

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

  // Build fallback summaries from the key metrics
  const topMetric = key_metrics[0];
  const trendDir  = (rawTrend.direction as string) ?? 'stable';
  const changePct = Number(rawTrend.change_rate ?? 0);
  const metaLine  = topMetric
    ? `Sales: $${topMetric.value.toLocaleString(undefined, { maximumFractionDigits: 0 })} USD`
    : 'Data processed successfully.';
  const changeStr = changePct !== 0
    ? ` Sales ${trendDir} by ${Math.abs(changePct)}% vs prior period.`
    : '';

  const simple   = rawLevels.simple   || `${metaLine}.${changeStr} Check the chart for details.`;
  const medium   = rawLevels.medium   || `${metaLine}.${changeStr} Top drivers: ${diagnostics[0] ?? 'see breakdown'}.`;
  const advanced = rawLevels.advanced || `${metaLine}.${changeStr} ${diagnostics.join(' | ')}`;

  return {
    query_type:     [String((raw.query_type as string) ?? 'descriptive')],
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

export const ChatContainer: React.FC = () => {
  const {
    messages, addMessage, updateMessage,
    currentPersona, setIsLoading, userId, conversationId, datasetRef,
  } = useAppContext();
  const endOfMessagesRef = useRef<HTMLDivElement>(null);
  const isSubmittingRef = useRef(false);

  useEffect(() => {
    endOfMessagesRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isSubmittingRef.current) return;
    
    isSubmittingRef.current = true;

    // 1️⃣ Add user message immediately
    const userMsgId = `user_${Date.now()}`;
    addMessage({ id: userMsgId, sender: 'user', text: trimmed, rawQuery: trimmed });

    // 2️⃣ Add AI placeholder (loading state)
    const aiMsgId = `ai_${Date.now() + 1}`;
    addMessage({ id: aiMsgId, sender: 'ai', isLoading: true, rawQuery: trimmed });
    setIsLoading(true);

    try {
      const res = await fetch(buildApiUrl('/api/query'), {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ query: text }),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.message ?? `Backend error ${res.status}`);
      }

      const rawEngineData = await res.json();

      // 3️⃣ Adapt raw engine output → MLOutputContract
      const mlContract = adaptEngineOutput(rawEngineData);

      // 4️⃣ Build persona-tailored rendered response
      const renderedResponse = buildResponseFromInsight(currentPersona, mlContract);

      // 5️⃣ Update the AI message with real data (triggers MongoDB persist)
      updateMessage(aiMsgId, {
        isLoading: false,
        response:  renderedResponse,
        rawInsight: mlContract,
        rawQuery:  text,
      });

    } catch (err: any) {
      console.error('[ChatContainer] Query failed:', err);
      // Show a friendly error block
      updateMessage(aiMsgId, {
        isLoading: false,
        response: {
          blocks: [{ type: 'headline', content: `Could not get an answer: ${err.message ?? 'Unknown error'}` }],
          confidenceLabel: 'Transparent',
          personaLabel:    currentPersona,
          queryType:       ['Unknown'],
          ttsHeadline:     'Error',
          evidence: {
            source:     'System',
            timestamp:  new Date().toISOString(),
            confidence: 0,
            notes:      err.message ?? '',
            rawValues:  [],
          },
        } as any,
        rawQuery: text,
      });
    } finally {
      setIsLoading(false);
      isSubmittingRef.current = false;
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-gray-50 overflow-hidden relative">
      {/* Scrollable Message Area */}
      <div className="flex-1 overflow-y-auto px-4 py-8 custom-scrollbar">
        <div className="max-w-4xl mx-auto min-h-full flex flex-col pt-8">
          {messages.length === 0 ? (
            <div className="m-auto text-center space-y-4 max-w-lg mb-20 fade-in">
              <div className="mx-auto w-16 h-16 bg-gradient-to-br from-primary-blue to-primary-blue-light rounded-2xl flex items-center justify-center shadow-lg shadow-primary-blue/20 mb-6">
                <span className="text-white font-bold text-2xl">B</span>
              </div>
              <h2 className="text-2xl font-bold text-gray-800">Hello! I'm Bolt.</h2>
              <p className="text-gray-500">
                Ask me anything about your Superstore data — sales trends, category breakdowns, regional comparisons, or forecasts. Switch personas on the sidebar to see how I adapt my language and depth.
              </p>
            </div>
          ) : (
            messages.map((m) => <MessageBubble key={m.id} message={m} />)
          )}
          <div ref={endOfMessagesRef} />
        </div>
      </div>

      {/* Input Area */}
      <ChatInput onSendMessage={handleSendMessage} />
    </div>
  );
};

