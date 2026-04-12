import React, { useState } from 'react';
import type { RenderedResponse, ResponseBlock, Persona } from '../../types';
import { ConfidenceBadge } from './ConfidenceBadge';
import { ChartRenderer } from './ChartRenderer';
import { EvidenceDrawer } from './EvidenceDrawer';
import { ArrowRight, Volume2, HelpCircle, X, AlertCircle, TrendingUp } from 'lucide-react';
import { useAppContext } from '../../stores/appStore';
import { simplifyBlock, type SimplifyContext } from '../../services/geminiService';
import { trackEvent } from '../../services/feedbackService';
import { useTranslation } from 'react-i18next';

// ================================================================
// CONFUSION BUTTON LABELS PER PERSONA
// ================================================================

const CONFUSION_LABEL_KEYS: Record<Persona, string> = {
  Beginner:   'response.help',
  Everyday:   'response.explain',
  SME:        'response.detail',
  Executive:  'response.soWhat',
  Analyst:    'response.methodology',
  Compliance: 'response.auditNote',
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
  const { t } = useTranslation();

  const handleToggle = async () => {
    if (!showSimplified && !dynamicExplanation) {
      if (currentPersona === 'Analyst') trackEvent('methodology_clicked');
      else trackEvent('confusion_clicked');
      setShowSimplified(true);
      setIsLoading(true);
      try {
        const text = await simplifyBlock(block.content, block.type, currentPersona, context);
        setDynamicExplanation(text);
      } catch {
        setDynamicExplanation(t('response.unableToLoad'));
      } finally {
        setIsLoading(false);
      }
    } else {
      setShowSimplified(!showSimplified);
    }
  };

  const btnLabel = t(CONFUSION_LABEL_KEYS[currentPersona]) ?? '?';

  return (
    <div className="response-block relative group">
      {children}
      <button
        onClick={handleToggle}
        className="confusion-btn mt-2 flex items-center gap-1"
        title={t('response.help')}
      >
        {showSimplified ? <X size={11} /> : <HelpCircle size={11} />}
        {showSimplified ? t('response.hideExplanation') : btnLabel}
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
              <span className="text-slate-500 ml-2 text-xs font-medium">{t('response.simplifying')}</span>
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
// AUDIT BANNER
// ================================================================

const AuditBanner: React.FC<{ content: string }> = ({ content }) => (
  <div className="audit-banner">
    <AlertCircle size={13} className="shrink-0 mt-0.5" />
    <span className="font-mono text-xs leading-relaxed">{content}</span>
  </div>
);

// ================================================================
// DIAGNOSTIC PILL
// ================================================================

const DiagnosticPill: React.FC<{ text: string }> = ({ text }) => (
  <div className="flex items-start gap-2 px-3 py-2 bg-amber-50/70 border border-amber-200/60 rounded-xl text-xs text-amber-800 font-medium leading-relaxed">
    <TrendingUp size={12} className="shrink-0 mt-0.5 text-amber-500" />
    {text.replace(/^⚑\s*/, '')}
  </div>
);

// ================================================================
// KPI STRIP
// ================================================================

const KpiStrip: React.FC<{ data: ResponseBlock }> = ({ data }) => {
  const metrics = data.chartData ?? [];
  if (metrics.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-3 py-1">
      {metrics.map((m, i) => (
        <div key={i} className="glass-card-low px-4 py-2 flex flex-col gap-0.5 min-w-[140px]">
          <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider">{m.label}</span>
          <span className="text-xl font-bold text-slate-800">
            {m.value.toLocaleString()} <span className="text-sm font-normal text-slate-500">{m.unit}</span>
          </span>
          {m.delta_pct != null && (
            <span className={`text-xs font-semibold ${m.delta_pct >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
              {m.delta_pct >= 0 ? '▲' : '▼'} {Math.abs(m.delta_pct).toFixed(1)}% vs prior
            </span>
          )}
        </div>
      ))}
    </div>
  );
};

// ================================================================
// MAIN RESPONSE CARD
// ================================================================

export interface ResponseCardProps {
  response: RenderedResponse;
  onActionClick?: (actionText: string) => void;
}

export const ResponseCard: React.FC<ResponseCardProps> = ({ response, onActionClick }) => {
  const { currentPersona, voiceMode, blindMode } = useAppContext();
  const { t } = useTranslation();

  const isCompliance = currentPersona === 'Compliance';
  const isAnalyst    = currentPersona === 'Analyst';
  const shouldExpandEvidence = isCompliance || isAnalyst;

  // ── TTS ──────────────────────────────────────────────────────────
  const readAloud = () => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    let fullText = response.ttsHeadline + '. ';
    const insight = response.blocks.find(b => b.type === 'insight')?.content;
    const action  = response.blocks.find(b => b.type === 'action')?.content;
    if (insight) fullText += insight + '. ';
    if (action)  fullText += 'Recommended next step: ' + action + '.';
    const utt = new SpeechSynthesisUtterance(fullText);
    utt.rate = 0.95;
    window.speechSynthesis.speak(utt);
  };

  React.useEffect(() => {
    if (voiceMode || blindMode) readAloud();
    return () => { if (voiceMode || blindMode) window.speechSynthesis.cancel(); };
  }, []);

  // ── Simplify context ──────────────────────────────────────────────
  const simplifyCtx: SimplifyContext = {
    query:          response.ttsHeadline,
    mainSummary:    response.ttsHeadline,
    metrics:        response.evidence.rawValues.map(v => ({
      label: v.label, value: v.value, prev_value: v.prev_value ?? null, unit: v.unit,
    })),
    breakdown:      response.evidence.rawValues.map(v => ({ label: v.label, value: v.value })),
    anomalies:      response.evidence.limitations ?? [],
  };

  // ── Extracted block groups ────────────────────────────────────────
  const actionBlocks  = response.blocks.filter(b => b.type === 'action');
  const diagBlocks    = response.blocks.filter(b => b.type === 'audit' && b.content.startsWith('⚑'));
  const coreBlocks    = response.blocks.filter(b => !actionBlocks.includes(b) && !diagBlocks.includes(b));

  return (
    <div className={`glass-card p-6 w-full space-y-4 stagger relative persona-card persona-${currentPersona.toLowerCase()}`}>

      {/* Top-right badges */}
      <div className="absolute top-4 right-4 flex items-center gap-2 z-10">
        {/* Debug: Query Type Tags */}
        <div className="flex gap-1 mr-2 no-speech">
          {(Array.isArray(response.queryType) ? response.queryType : []).map((qt, i) => (
            <span key={i} className="px-1.5 py-0.5 rounded bg-slate-100 text-[10px] font-mono text-slate-500 border border-slate-200 uppercase tracking-tighter">
              {qt}
            </span>
          ))}
        </div>
        
        <span className={`persona-chip persona-chip-${currentPersona.toLowerCase()}`}>
          {response.personaLabel}
        </span>
        <ConfidenceBadge status={response.confidenceLabel} />
        <button
          onClick={readAloud}
          className="p-1.5 rounded-full text-slate-400 hover:text-blue-500 hover:bg-blue-50 transition-colors shadow-sm bg-white/50"
          title={t('response.readAloud')}
        >
          <Volume2 size={15} />
        </button>
      </div>

      {/* Warning Banner (Security / System execution alerts) */}
      {response._originalInsight?.warnings && response._originalInsight.warnings.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 space-y-1 mb-3">
          <div className="flex items-center gap-2 text-red-700 font-bold text-sm">
            <AlertCircle size={16} /> {t('response.systemWarnings')}
          </div>
          <ul className="list-disc pl-5 text-sm text-red-600 font-medium">
            {response._originalInsight.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Core blocks (headline, audit, chart, kpi, insight, table, secondary_chart) */}
      {coreBlocks.map((block, i) => {

        if (block.type === 'headline') {
          return (
            <BlockWithConfusion key={i} block={block} context={simplifyCtx}>
              <h3 className={`font-semibold text-slate-800 leading-snug pr-32 ${
                currentPersona === 'Beginner'  ? 'text-base'  :
                currentPersona === 'Executive' ? 'text-xl'    :
                'text-[17px]'
              }`}>
                {block.content}
              </h3>
            </BlockWithConfusion>
          );
        }

        if (block.type === 'audit' && block.auditContent) {
          return <AuditBanner key={i} content={block.auditContent} />;
        }

        if (block.type === 'kpi' && block.chartData) {
          return <KpiStrip key={i} data={block} />;
        }

        if (block.type === 'chart' && block.chartData && block.chartData.length > 0 && block.chartType) {
          return (
            <div className="response-block" key={i}>
              {block.content && (
                <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider mb-2">{block.content}</p>
              )}
              <ChartRenderer visual={block.chartType} data={block.chartData} />
            </div>
          );
        }

        if (block.type === 'secondary_chart' && block.chartData && block.chartData.length > 0 && block.chartType) {
          return (
            <div key={i} className="response-block secondary-visual">
              <p className="text-xs text-slate-400 uppercase tracking-wider mb-2 font-semibold">{t('response.supportingView')}</p>
              <ChartRenderer visual={block.chartType} data={block.chartData} compact />
            </div>
          );
        }

        if (block.type === 'table') {
          return (
            <div key={i} className="response-block">
              <p className="text-xs font-semibold text-slate-600 mb-2 uppercase tracking-wide">{t('response.exactRecordValues')}</p>
              <ChartRenderer visual="Table" data={block.tableData ?? block.chartData ?? []} />
              <p className="text-xs text-slate-500 mt-3 leading-relaxed">{block.content}</p>
            </div>
          );
        }

        if (block.type === 'insight') {
          return (
            <BlockWithConfusion key={i} block={block} context={simplifyCtx}>
              <div className="flex items-start gap-3">
                <div className={`w-1 min-h-[20px] rounded-full shrink-0 mt-1 ${
                  isCompliance ? 'bg-amber-400' :
                  isAnalyst    ? 'bg-violet-400' :
                  'bg-blue-400'
                }`} style={{ height: 'auto' }} />
                <p className={`leading-relaxed font-medium ${
                  currentPersona === 'Beginner' ? 'text-sm text-slate-600' :
                  currentPersona === 'Analyst'  ? 'text-xs text-slate-700 font-mono' :
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

      {/* Diagnostics / Anomaly Pills */}
      {diagBlocks.length > 0 && (
        <div className="space-y-2 pt-1">
          <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider mb-2">{t('response.keyDrivers')}</p>
          <div className="flex flex-wrap gap-2">
            {diagBlocks.map((b, i) => <DiagnosticPill key={i} text={b.content} />)}
          </div>
        </div>
      )}

      {/* Recommended Next Steps */}
      {actionBlocks.length > 0 && (
        <div className="space-y-2 pt-1">
          <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider mb-3 mt-4">
            {t('response.recommendedNextSteps')}
          </p>
          {actionBlocks.map((block, i) => (
            <BlockWithConfusion key={i} block={block} context={simplifyCtx}>
              <button
                onClick={() => {
                  trackEvent('action_followed');
                  onActionClick?.(block.content);
                }}
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
