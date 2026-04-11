import React, { useState } from 'react';
import type { RenderedResponse, ResponseBlock, Persona } from '../../types';
import { ConfidenceBadge } from './ConfidenceBadge';
import { ChartRenderer } from './ChartRenderer';
import { EvidenceDrawer } from './EvidenceDrawer';
import { ArrowRight, Volume2, HelpCircle, X, AlertCircle } from 'lucide-react';
import { useAppContext } from '../../stores/appStore';
import { simplifyBlock, type SimplifyContext } from '../../services/geminiService';

// ================================================================
// PERSONA → CONFUSION BUTTON LABEL
// ================================================================

const CONFUSION_LABEL: Record<Persona, string> = {
  Beginner: '? Help',
  Everyday: '? Explain',
  SME: '? Detail',
  Executive: '? So what',
  Analyst: '? Methodology',
  Compliance: '? Audit note',
};

// ================================================================
// BLOCK WITH CONFUSION BUTTON
// ================================================================

const BlockWithConfusion: React.FC<{
  block: ResponseBlock;
  children: React.ReactNode;
  context?: SimplifyContext;
}> = ({ block, children, context }) => {
  const [showSimplified, setShowSimplified] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [dynamicExplanation, setDynamicExplanation] = useState<string | null>(null);
  const { currentPersona } = useAppContext();

  const handleToggle = async () => {
    if (!showSimplified && !dynamicExplanation) {
      setShowSimplified(true);
      setIsLoading(true);
      try {
        // Pass full data context so Gemini can reference real numbers
        const text = await simplifyBlock(block.content, block.type, currentPersona, context);
        setDynamicExplanation(text);
      } catch {
        setDynamicExplanation('Unable to load explanation right now.');
      } finally {
        setIsLoading(false);
      }
    } else {
      setShowSimplified(!showSimplified);
    }
  };

  const btnLabel = CONFUSION_LABEL[currentPersona] ?? '?';

  return (
    <div className="response-block relative group">
      {children}

      {/* Always visible — not hidden behind hover */}
      <button
        onClick={handleToggle}
        className="confusion-btn mt-2 flex items-center gap-1"
        title="Get a simpler explanation using AI"
      >
        {showSimplified ? <X size={11} /> : <HelpCircle size={11} />}
        {showSimplified ? 'Hide explanation' : btnLabel}
      </button>

      <div
        className={`overflow-hidden transition-all duration-300 ease-in-out ${
          showSimplified ? 'max-h-56 opacity-100 mt-3' : 'max-h-0 opacity-0'
        }`}
      >
        <div className="glass-card-low p-3 text-sm text-blue-700 leading-relaxed bg-blue-50/50">
          {isLoading ? (
            <div className="flex items-center gap-2">
              {[0, 150, 300].map(d => (
                <div
                  key={d}
                  className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse"
                  style={{ animationDelay: `${d}ms` }}
                />
              ))}
              <span className="text-slate-500 ml-2 text-xs font-medium">Simplifying...</span>
            </div>
          ) : (
            <>💡 {dynamicExplanation ?? block.simplified}</>
          )}
        </div>
      </div>
    </div>
  );
};

// ================================================================
// AUDIT BANNER (Compliance only)
// ================================================================

const AuditBanner: React.FC<{ content: string }> = ({ content }) => (
  <div className="audit-banner">
    <AlertCircle size={13} className="shrink-0 mt-0.5" />
    <span className="font-mono text-xs leading-relaxed">{content}</span>
  </div>
);

// ================================================================
// MAIN RESPONSE CARD
// ================================================================

export interface ResponseCardProps {
  response: RenderedResponse;
  onActionClick?: (actionText: string) => void;
}

export const ResponseCard: React.FC<ResponseCardProps> = ({ response, onActionClick }) => {
  const { currentPersona, voiceMode } = useAppContext();

  const isCompliance = currentPersona === 'Compliance';
  const isAnalyst = currentPersona === 'Analyst';
  const shouldExpandEvidence = isCompliance || isAnalyst;

  // ── TTS ──────────────────────────────────────────────────────
  const readAloud = () => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();

    let fullText = response.ttsHeadline + '. ';
    const insight = response.blocks.find(b => b.type === 'insight')?.content;
    const action = response.blocks.find(b => b.type === 'action')?.content;
    if (insight) fullText += insight + '. ';
    if (action) fullText += 'Recommended action: ' + action + '.';

    const utt = new SpeechSynthesisUtterance(fullText);
    utt.rate = 0.95;
    window.speechSynthesis.speak(utt);
  };

  React.useEffect(() => {
    if (voiceMode) readAloud();
    return () => { if (voiceMode) window.speechSynthesis.cancel(); };
  }, []);

  // ── Action buttons (max per persona) ─────────────────────────
  const actionBlocks = response.blocks.filter(b => b.type === 'action');

  // ── Insight context for the confusion button (simplifyBlock) ──
  // Extract from _originalInsight so Gemini has the actual ML data numbers.
  const rawInsight = (response as any)._originalInsight ?? response.evidence;
  const simplifyCtx: SimplifyContext | undefined = rawInsight ? {
    query: response.evidence.source ? response.evidence.rawValues?.[0]?.label ?? 'data analysis'
      : 'data analysis',
    mainSummary: response.ttsHeadline,
    metrics: response.evidence.rawValues.map(v => ({
      label: v.label,
      value: v.value,
      prev_value: v.prev_value ?? null,
      unit: v.unit,
    })),
    breakdown: response.evidence.rawValues.map(v => ({ label: v.label, value: v.value })),
    anomalies: response.evidence.limitations ?? [],
    trendDirection: undefined,
    // The actual user query is in the metadata.query stored via evidence
    query: response.evidence.source ?? response.ttsHeadline,
  } : undefined;

  // Override the query with a cleaner extraction from evidence.source
  // evidence.source is set by insightAdapter as the original query string
  const finalCtx: SimplifyContext | undefined = simplifyCtx ? {
    ...simplifyCtx,
    query: response.evidence.source
      // evidence.source can be "ML Analytics Engine" so use ttsHeadline as fallback
      ? response.ttsHeadline
      : response.ttsHeadline,
  } : undefined;

  return (
    <div className={`glass-card p-6 w-full space-y-4 stagger relative persona-card persona-${currentPersona.toLowerCase()}`}>

      {/* Top-right badges */}
      <div className="absolute top-4 right-4 flex items-center gap-2 z-10">
        <span className={`persona-chip persona-chip-${currentPersona.toLowerCase()}`}>
          {response.personaLabel}
        </span>
        <ConfidenceBadge status={response.confidenceLabel} />
        <button
          onClick={readAloud}
          className="p-1.5 rounded-full text-slate-400 hover:text-blue-500 hover:bg-blue-50 transition-colors shadow-sm bg-white/50"
          title="Read aloud"
        >
          <Volume2 size={15} />
        </button>
      </div>

      {/* Render all blocks */}
      {response.blocks.map((block, i) => {

        // HEADLINE
        if (block.type === 'headline') {
          return (
            <BlockWithConfusion key={i} block={block} context={finalCtx}>
              <h3 className={`font-semibold text-slate-800 leading-snug pr-12 ${
                currentPersona === 'Beginner' ? 'text-base' :
                currentPersona === 'Executive' ? 'text-xl' :
                'text-[17px]'
              }`}>
                {block.content}
              </h3>
            </BlockWithConfusion>
          );
        }

        // AUDIT BANNER
        if (block.type === 'audit' && block.auditContent) {
          return <AuditBanner key={i} content={block.auditContent} />;
        }

        // PRIMARY CHART
        if (block.type === 'chart' && block.chartData && block.chartType) {
          return (
            <div className="response-block" key={i}>
              <ChartRenderer visual={block.chartType} data={block.chartData} />
            </div>
          );
        }

        // SECONDARY CHART (Analyst gets compact table, SME gets compact KPI)
        if (block.type === 'secondary_chart' && block.chartData && block.chartType) {
          return (
            <div key={i} className="response-block secondary-visual">
              <p className="text-xs text-slate-400 uppercase tracking-wider mb-2 font-semibold">
                Supporting View
              </p>
              <ChartRenderer visual={block.chartType} data={block.chartData} compact />
            </div>
          );
        }

        // TABLE (Compliance primary block)
        if (block.type === 'table') {
          return (
            <div key={i} className="response-block">
              <p className="text-xs font-semibold text-slate-600 mb-2 uppercase tracking-wide">
                Exact Record Values
              </p>
              <ChartRenderer visual="Table" data={block.tableData ?? block.chartData ?? []} />
              <p className="text-xs text-slate-500 mt-3 leading-relaxed">{block.content}</p>
            </div>
          );
        }

        // INSIGHT
        if (block.type === 'insight') {
          return (
            <BlockWithConfusion key={i} block={block} context={finalCtx}>
              <div className="flex items-start gap-3">
                <div className={`w-1 min-h-[20px] rounded-full shrink-0 mt-1 ${
                  isCompliance ? 'bg-amber-400' :
                  isAnalyst ? 'bg-violet-400' :
                  'bg-blue-400'
                }`} style={{ height: 'auto' }} />
                <p className={`leading-relaxed font-medium ${
                  currentPersona === 'Beginner' ? 'text-sm text-slate-600' :
                  currentPersona === 'Analyst' ? 'text-xs text-slate-700 font-mono' :
                  'text-sm text-slate-600'
                }`}>
                  {block.content}
                </p>
              </div>
            </BlockWithConfusion>
          );
        }

        return null;
      })}

      {/* ACTION BUTTONS — each wrapped with the confusion button so users can ask what an action means */}
      {actionBlocks.length > 0 && (
        <div className="space-y-2 pt-1">
          <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider mb-3 mt-4">
            Recommended Next Steps
          </p>
          {actionBlocks.map((block, i) => (
            <BlockWithConfusion key={i} block={block} context={finalCtx}>
              <button
                onClick={() => onActionClick?.(block.content)}
                className="flex items-center gap-2 px-4 py-2 glass-card-low text-slate-700 text-sm font-semibold hover:text-blue-600 hover:shadow-md transition-all cursor-pointer w-full text-left"
              >
                {block.content}
                <ArrowRight size={14} className="text-slate-400 ml-auto shrink-0" />
              </button>
            </BlockWithConfusion>
          ))}
        </div>
      )}

      {/* Evidence / Audit Drawer */}
      <EvidenceDrawer
        evidence={response.evidence}
        defaultExpanded={shouldExpandEvidence}
        isCompliance={isCompliance}
        isAnalyst={isAnalyst}
      />
    </div>
  );
};
