import React from 'react';
import {
  BarChart3,
  Binary,
  Database,
  FileSpreadsheet,
  Filter,
  FlaskConical,
  Layers3,
  ShieldCheck,
} from 'lucide-react';
import type { ChatMessage, DatasetSchema, MetricPoint, Persona, RenderedResponse } from '../types';

interface ChatInspectorPanelProps {
  selectedMessage: ChatMessage | null;
  datasetRef: string | null;
  datasetSchema: DatasetSchema | null;
  currentPersona: Persona;
}

const metricValue = (metric: MetricPoint) => {
  const unit = metric.unit ? ` ${metric.unit}` : '';
  return `${metric.value.toLocaleString()}${unit}`;
};

export const ChatInspectorPanel: React.FC<ChatInspectorPanelProps> = ({
  selectedMessage,
  datasetRef,
  datasetSchema,
  currentPersona,
}) => {
  const response: RenderedResponse | undefined = selectedMessage?.response;
  const evidence = response?.evidence;
  const queryTypes = Array.isArray(response?.queryType) ? response?.queryType : [];
  const recommendedVisual =
    response?.suggestedVisual ||
    response?.blocks.find((block) => block.chartType)?.chartType ||
    'None';

  return (
    <aside className="flex h-full min-h-0 min-w-[272px] flex-col border-l border-cyan-300/8 bg-[linear-gradient(180deg,rgba(8,11,18,0.98),rgba(4,6,11,0.98))]">
      <div className="border-b border-white/6 px-3.5 py-2.5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-zinc-600">Evidence Panel</p>
        <h3 className="mt-1 text-[0.95rem] font-semibold text-white">Response Details</h3>
        <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">
          Open a response from the middle column to inspect the dataset context, method, confidence, and metadata.
        </p>
      </div>

      <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto px-3.5 py-2.5">
        {!selectedMessage || !response || !evidence ? (
          <div className="flex h-full min-h-[240px] items-center justify-center">
            <section className="flex max-w-[250px] flex-col items-center justify-center text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-[1rem] border border-white/8 bg-white/[0.03]">
                <FlaskConical className="h-5 w-5 text-violet-300/80" />
              </div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-600">No Response Selected</p>
              <p className="mt-2.5 text-[12px] leading-relaxed text-zinc-500">
                Choose <span className="text-white">Inspect</span> on any Bolt response to open the method, evidence, and metadata here.
              </p>
            </section>
          </div>
        ) : (
          <>
            <section className="glass-card-low mb-2.5 rounded-[0.9rem] border border-cyan-300/8 p-2.5">
              <div className="mb-2.5 flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4 text-cyan-300" />
                <h4 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500">Dataset</h4>
              </div>

              <div className="space-y-2.5 text-[11px] text-zinc-300">
                <div>
                  <p className="mb-1 text-zinc-500">Working CSV / Dataset Ref</p>
                  <p className="break-all font-mono text-[11px] text-cyan-100">{datasetRef || 'No dataset selected'}</p>
                </div>

                {datasetSchema ? (
                  <div className="grid grid-cols-1 gap-3">
                    <div>
                      <p className="mb-1 text-zinc-500">Metric column</p>
                      <p className="font-medium text-white">{datasetSchema.metric_col}</p>
                    </div>
                    <div>
                      <p className="mb-1 text-zinc-500">Date column</p>
                      <p className="font-medium text-white">{datasetSchema.date_col}</p>
                    </div>
                    <div>
                      <p className="mb-1 text-zinc-500">Dimensions</p>
                      <div className="flex flex-wrap gap-1.5">
                        {datasetSchema.dimension_cols.map((dimension) => (
                          <span
                            key={dimension}
                            className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] text-zinc-300"
                          >
                            {dimension}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-zinc-500">Schema will appear here once a dataset is profiled.</p>
                )}
              </div>
            </section>

            <section className="glass-card-low mb-2.5 rounded-[0.9rem] border border-violet-400/10 p-2.5">
              <div className="mb-2.5 flex items-center gap-2">
                <Binary className="h-4 w-4 text-violet-300" />
                <h4 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500">Method</h4>
              </div>

              <div className="space-y-2.5 text-[11px] text-zinc-300">
                <div>
                  <p className="mb-1 text-zinc-500">Query</p>
                  <p className="leading-relaxed text-white">{selectedMessage.rawQuery || selectedMessage.text || 'No query text'}</p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="mb-1 text-zinc-500">Persona</p>
                    <p className="font-medium text-white">{response.personaLabel || currentPersona}</p>
                  </div>
                  <div>
                    <p className="mb-1 text-zinc-500">Suggested Visual</p>
                    <p className="font-medium text-white">{recommendedVisual}</p>
                  </div>
                </div>

                <div>
                  <p className="mb-1 text-zinc-500">Query types</p>
                  <div className="flex flex-wrap gap-1.5">
                    {queryTypes.map((type) => (
                      <span
                        key={type}
                        className="rounded-full border border-cyan-300/10 bg-cyan-400/8 px-2 py-1 text-[10px] text-cyan-100"
                      >
                        {type}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            <section className="glass-card-low mb-2.5 rounded-[0.9rem] border border-white/10 p-2.5">
              <div className="mb-2.5 flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-emerald-300" />
                <h4 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500">Evidence</h4>
              </div>

              <div className="space-y-2.5 text-[11px] text-zinc-300">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="mb-1 text-zinc-500">Confidence</p>
                    <p className="font-medium text-white">{(evidence.confidence * 100).toFixed(1)}%</p>
                  </div>
                  <div>
                    <p className="mb-1 text-zinc-500">Timestamp</p>
                    <p className="font-medium text-white">{new Date(evidence.timestamp).toLocaleString()}</p>
                  </div>
                </div>

                <div>
                  <p className="mb-1 text-zinc-500">Source</p>
                  <p className="break-all font-mono text-[11px] text-cyan-100">{evidence.source}</p>
                </div>

                <div>
                  <p className="mb-1 text-zinc-500">Notes</p>
                  <p className="leading-relaxed text-zinc-300">{evidence.notes}</p>
                </div>

                {evidence.filters && (
                  <div>
                      <p className="mb-1 flex items-center gap-1 text-zinc-500">
                      <Filter className="h-3.5 w-3.5" /> Active Filters
                    </p>
                    <code className="block rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-[10px] leading-relaxed text-cyan-100">
                      {evidence.filters}
                    </code>
                  </div>
                )}

                {evidence.formula && (
                  <div>
                    <p className="mb-1 text-zinc-500">Formula / Calculation</p>
                    <code className="block rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-[10px] leading-relaxed text-violet-100">
                      {evidence.formula}
                    </code>
                  </div>
                )}
              </div>
            </section>

            <section className="glass-card-low mb-2.5 rounded-[0.9rem] border border-white/10 p-2.5">
              <div className="mb-2.5 flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-cyan-300" />
                <h4 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500">Raw Values</h4>
              </div>

              {evidence.rawValues.length > 0 ? (
                <div className="space-y-1.5">
                  {evidence.rawValues.slice(0, 8).map((metric) => (
                    <div
                      key={`${metric.label}-${metric.value}`}
                      className="flex items-center justify-between rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2"
                    >
                      <div className="min-w-0 pr-3">
                        <p className="truncate text-[11px] font-medium text-white">{metric.label}</p>
                        {metric.prev_value != null && (
                          <p className="text-[10px] text-zinc-500">Baseline: {metric.prev_value.toLocaleString()}</p>
                        )}
                      </div>
                      <p className="shrink-0 text-[11px] font-semibold text-cyan-100">{metricValue(metric)}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-zinc-500">No raw values available for this response.</p>
              )}
            </section>

            <section className="glass-card-low rounded-[0.9rem] border border-white/10 p-2.5">
              <div className="mb-2.5 flex items-center gap-2">
                <Layers3 className="h-4 w-4 text-amber-300" />
                <h4 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500">Limitations</h4>
              </div>

              {evidence.limitations && evidence.limitations.length > 0 ? (
                <ul className="space-y-1.5 text-[11px] text-amber-100">
                  {evidence.limitations.map((limitation) => (
                    <li
                      key={limitation}
                      className="rounded-xl border border-amber-400/12 bg-amber-400/8 px-3 py-2 leading-relaxed"
                    >
                      {limitation}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-zinc-500">No explicit limitations were attached to this response.</p>
              )}
            </section>
          </>
        )}
      </div>

      <div className="border-t border-white/6 px-3.5 py-2.5">
        <div className="flex items-center gap-2 text-[10px] text-zinc-500">
          <Database className="h-3.5 w-3.5 text-cyan-300" />
          Right panel updates only when you explicitly inspect a response.
        </div>
      </div>
    </aside>
  );
};
