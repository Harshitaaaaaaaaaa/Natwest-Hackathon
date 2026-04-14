import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BarChart2,
  Brain,
  ChevronDown,
  Clock,
  Eye,
  LogOut,
  Mic,
  RotateCcw,
  Send,
  Shield,
  Sparkles,
  Users,
  Volume2,
  VolumeX,
  Zap,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ChatMessage, DatasetSchema, Persona } from '../types';
import { trackPersonaSwitch, trackQueryComplexity } from '../services/feedbackService';
import { classifyIntent } from '../services/geminiService';
import { getInsightResponse } from '../services/insightAdapter';
import { newMessageId } from '../services/sessionService';
import { useAppContext } from '../stores/appStore';
import { buildResponseFromInsight } from '../utils/responseMapper';
import { BoltLogo } from './BoltLogo';
import { ChatInspectorPanel } from './ChatInspectorPanel';
import { MessageBubble } from './ChatLayout/MessageBubble';
import { LanguageSwitcher } from './LanguageSwitcher';

interface PersonaConfig {
  icon: React.ReactNode;
  label: string;
  description: string;
  color: string;
}

const PERSONA_CONFIG: Record<Persona, PersonaConfig> = {
  Beginner: {
    icon: <Eye size={14} />,
    label: 'Guided Mode',
    description: 'Simple explanations, one chart',
    color: 'persona-beginner',
  },
  Everyday: {
    icon: <Zap size={14} />,
    label: 'Quick View',
    description: 'Fast, practical answers',
    color: 'persona-everyday',
  },
  SME: {
    icon: <Users size={14} />,
    label: 'Ops Mode',
    description: 'KPIs, drivers, team context',
    color: 'persona-sme',
  },
  Executive: {
    icon: <BarChart2 size={14} />,
    label: 'Executive View',
    description: 'Impact-first, strategic signal',
    color: 'persona-executive',
  },
  Analyst: {
    icon: <Brain size={14} />,
    label: 'Analyst Mode',
    description: 'Full decomposition, exact data',
    color: 'persona-analyst',
  },
  Compliance: {
    icon: <Shield size={14} />,
    label: 'Audit/Compliance',
    description: 'Traceable, auditable, sourced',
    color: 'persona-compliance',
  },
};

const getDynamicQueries = (persona: Persona, schema: DatasetSchema | null): string[] => {
  const metric = schema?.metric_col || 'revenue';
  const dim = schema?.dimension_cols?.[0] || 'department';
  const dim2 = schema?.dimension_cols?.[1] || 'category';

  switch (persona) {
    case 'Beginner':
      return [`What is the total ${metric}?`, `Show me ${metric} by ${dim}`, `What is the highest ${dim} by ${metric}?`];
    case 'Everyday':
      return [
        `How is ${metric} trending over time?`,
        `Compare ${metric} between different ${dim}s`,
        `Which ${dim} has the lowest ${metric}?`,
      ];
    case 'SME':
      return [
        `Show me the performance KPIs focusing on ${metric}`,
        `What is driving the variance in ${metric}?`,
        `Compare ${metric} across ${dim}s`,
      ];
    case 'Executive':
      return [
        `What is the bottom line on ${metric}?`,
        `What factors are driving ${metric}?`,
        `Compare top ${dim}s by ${metric}`,
      ];
    case 'Analyst':
      return [
        `Show exact ${metric} breakdown by ${dim} and ${dim2}`,
        `What are the top drivers of variance in ${metric}?`,
        `Run descriptive analysis on ${metric} across ${dim}s`,
      ];
    case 'Compliance':
      return [
        `Show auditable ${metric} figures by ${dim}`,
        `Compare entries for ${dim} against total ${metric}`,
        `Document the variance in ${metric} with full audit trail`,
      ];
    default:
      return [`How is ${metric} trending?`];
  }
};

interface PersonaSwitcherProps {
  current: Persona;
  onSwitch: (p: Persona) => void;
}

const PersonaSwitcher: React.FC<PersonaSwitcherProps> = ({ current, onSwitch }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const cfg = PERSONA_CONFIG[current];

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((prev) => !prev)}
        className={`persona-switcher-btn ${cfg.color} flex items-center gap-2`}
        title="Switch persona - re-renders all insights instantly"
      >
        {cfg.icon}
        <span className="font-semibold text-sm">{cfg.label}</span>
        <ChevronDown size={13} className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="persona-dropdown">
          <p className="px-3 pb-2 pt-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Switch Persona - re-renders instantly
          </p>
          {(Object.keys(PERSONA_CONFIG) as Persona[]).map((p) => {
            const c = PERSONA_CONFIG[p];
            const isActive = p === current;

            return (
              <button
                key={p}
                onClick={() => {
                  onSwitch(p);
                  setOpen(false);
                  if (p !== current) {
                    trackPersonaSwitch(p);
                  }
                }}
                className={`persona-dropdown-item ${isActive ? 'active' : ''}`}
              >
                <span className={`persona-dot ${c.color}`} />
                <div className="flex flex-col items-start">
                  <span className="text-sm font-semibold text-white">{c.label}</span>
                  <span className="text-xs text-zinc-500">{c.description}</span>
                </div>
                {isActive && <span className="ml-auto text-xs font-semibold text-violet-300">Active</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export const PresentationShell: React.FC = () => {
  const {
    messages,
    addMessage,
    updateMessage,
    currentPersona,
    switchPersona,
    isLoading,
    setIsLoading,
    voiceMode,
    setVoiceMode,
    blindMode,
    isRestoring,
    hasMoreHistory,
    loadMoreHistory,
    startFreshConversation,
    logoutUser,
    datasetRef,
    datasetSchema,
    language,
    setLanguage,
  } = useAppContext();

  const { t } = useTranslation();

  const [input, setInput] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [inspectedMessageId, setInspectedMessageId] = useState<string | null>(null);
  const isSubmittingRef = useRef(false);
  const recognitionRef = useRef<any>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const messageListRef = useRef<HTMLDivElement>(null);
  const pendingBlindVoiceRef = useRef(false);

  const blindSpeak = useCallback(
    (text: string) => {
      if (!blindMode || !text?.trim()) return;
      if (!('speechSynthesis' in window)) return;

      window.speechSynthesis.cancel();
      const utt = new SpeechSynthesisUtterance(text.trim());
      utt.rate = 0.9;
      utt.onend = () => {
        if (pendingBlindVoiceRef.current) {
          pendingBlindVoiceRef.current = false;
          setTimeout(() => toggleRecording(), 400);
        }
      };
      window.speechSynthesis.speak(utt);
    },
    [blindMode],
  );

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (!textareaRef.current) return;
    textareaRef.current.style.height = 'auto';
    textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 132)}px`;
  }, [input]);

  const handleScroll = useCallback(async () => {
    const el = messageListRef.current;
    if (!el || !hasMoreHistory || isRestoring) return;
    if (el.scrollTop < 80) {
      const prevScrollHeight = el.scrollHeight;
      await loadMoreHistory();
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight - prevScrollHeight;
      });
    }
  }, [hasMoreHistory, isRestoring, loadMoreHistory]);

  const processQuery = async (queryText: string) => {
    const trimmed = queryText.trim();
    if (!trimmed || isLoading || isSubmittingRef.current) return;

    isSubmittingRef.current = true;
    setInput('');

    const userMsgId = newMessageId();
    addMessage({ id: userMsgId, sender: 'user', text: trimmed, rawQuery: trimmed });

    const aiMsgId = newMessageId();
    addMessage({ id: aiMsgId, sender: 'ai', isLoading: true });
    setIsLoading(true);

    try {
      const intent = await classifyIntent(queryText, currentPersona);
      trackQueryComplexity(intent.query_type);

      if (intent.query_type.includes('Conversational')) {
        const { handleConversationalQuery } = await import('../services/geminiService');
        const text = await handleConversationalQuery(queryText, currentPersona, language);
        updateMessage(aiMsgId, {
          isLoading: false,
          text,
          rawQuery: queryText,
        });
        if (blindMode) {
          pendingBlindVoiceRef.current = true;
          blindSpeak(text);
        }
        return;
      }

      const insight = await getInsightResponse(
        queryText,
        intent,
        currentPersona,
        datasetRef || 'data/Superstore.csv',
        datasetSchema,
        language,
      );

      const response = buildResponseFromInsight(currentPersona, insight);

      updateMessage(aiMsgId, {
        isLoading: false,
        response,
        rawInsight: insight,
        rawQuery: queryText,
      });

      if (blindMode) {
        let readText = `${response.ttsHeadline}. `;
        const insightBlock = response.blocks.find((b) => b.type === 'insight');
        if (insightBlock) readText += insightBlock.content;
        pendingBlindVoiceRef.current = true;
        blindSpeak(readText);
      }
    } catch (err) {
      console.error('[PresentationShell] processQuery failed:', err);
      updateMessage(aiMsgId, { isLoading: false, response: undefined });
    } finally {
      setIsLoading(false);
      isSubmittingRef.current = false;
    }
  };

  const handleAnalyze = () => processQuery(input);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleAnalyze();
    }
  };

  const toggleRecording = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert(t('voiceNotSupported'));
      return;
    }

    if (isRecording) {
      recognitionRef.current?.stop();
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    let localTranscript = '';

    recognition.onstart = () => {
      setIsRecording(true);
      setInput('');
    };

    recognition.onresult = (event: any) => {
      let finalTranscript = '';
      let interimTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
          interimTranscript += event.results[i][0].transcript;
        }
      }
      localTranscript = finalTranscript || interimTranscript;
      setInput(localTranscript);
    };

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error', event.error);
      setIsRecording(false);
    };

    recognition.onend = () => {
      setIsRecording(false);
      if (localTranscript.trim() && !isLoading) {
        processQuery(localTranscript.trim());
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
  };

  const examples = useMemo(() => getDynamicQueries(currentPersona, datasetSchema), [currentPersona, datasetSchema]);

  const inspectedMessage = useMemo(() => {
    if (inspectedMessageId == null) return null;
    return messages.find((message) => message.id === inspectedMessageId && message.sender === 'ai' && message.response) || null;
  }, [messages, inspectedMessageId]);

  const handleInspectMessage = useCallback((message: ChatMessage) => {
    setInspectedMessageId(message.id);
  }, []);

  return (
    <div
      className="grid h-full min-h-0 w-full overflow-hidden"
      style={{ gridTemplateColumns: 'minmax(220px, 18vw) minmax(0, 1fr) minmax(280px, 24vw)' }}
    >
      <aside className="flex h-full min-h-0 flex-col border-r border-cyan-300/8 bg-[linear-gradient(180deg,rgba(7,11,17,0.98),rgba(5,7,12,0.98))]">
        <div className="border-b border-white/6 px-3 py-3">
          <div className="flex flex-col gap-3">
            <BoltLogo className="w-[84px] max-w-full mix-blend-screen opacity-92 [filter:drop-shadow(0_0_8px_rgba(77,226,255,0.07))_drop-shadow(0_0_12px_rgba(180,108,255,0.07))]" />
            <div className="flex items-center gap-1.5">
              <div className="min-w-0 flex-1">
                <LanguageSwitcher onLanguageChange={setLanguage} />
              </div>
              <button
                onClick={() => {
                  if (voiceMode && 'speechSynthesis' in window) window.speechSynthesis.cancel();
                  setVoiceMode(!voiceMode);
                }}
                className={`shrink-0 rounded-lg border border-white/10 p-2 transition-all shadow-sm ${
                  voiceMode ? 'bg-violet-500/15 text-violet-300' : 'bg-white/[0.03] text-zinc-500 hover:bg-cyan-400/8 hover:text-cyan-200'
                }`}
                title="Toggle Voice Mode"
              >
                {voiceMode ? <Volume2 size={14} /> : <VolumeX size={14} />}
              </button>
              <button
                onClick={logoutUser}
                className="shrink-0 rounded-lg border border-white/10 bg-white/[0.03] p-2 text-zinc-500 transition-all shadow-sm hover:bg-red-500/10 hover:text-red-300"
                title="Logout / Switch User"
              >
                <LogOut size={14} />
              </button>
            </div>
          </div>
        </div>

        <div className="custom-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto px-3 py-3">
          <div className="glass-card-low mb-2.5 rounded-[0.9rem] border border-cyan-300/8 p-2.5">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-600">Ask Bolt</p>
            <div className="space-y-2">
              <div className="rounded-[0.85rem] border border-white/10 bg-black/30 px-2.5 py-2">
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={isLoading}
                  rows={2}
                  className="custom-scrollbar min-h-[64px] max-h-[108px] w-full resize-none overflow-y-auto bg-transparent text-[11px] leading-relaxed text-zinc-100 placeholder:text-zinc-500 focus:outline-none"
                  placeholder={t('placeholder')}
                  style={{ border: 'none' }}
                />
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={toggleRecording}
                  className={`glass-card flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center transition-colors ${
                    isRecording ? 'border-red-500/30 bg-red-500/10 text-red-300 animate-pulse' : 'text-zinc-500 hover:text-cyan-200'
                  }`}
                  title={isRecording ? t('recording') : t('voiceInput')}
                >
                  <Mic className="h-3 w-3" />
                </button>

                <button
                  onClick={handleAnalyze}
                  disabled={!input.trim() || isLoading}
                  className="flex h-8 min-w-0 flex-1 items-center justify-center gap-1 rounded-[0.85rem] bg-[linear-gradient(90deg,#26d9ff_0%,#6ea6ff_38%,#a85cff_72%,#cf78ff_100%)] px-2.5 text-[11px] font-semibold text-white shadow-[0_0_20px_rgba(77,226,255,0.14),0_0_18px_rgba(180,108,255,0.14)] transition-all hover:brightness-110 disabled:bg-zinc-800 disabled:text-zinc-500"
                  style={{ border: 'none' }}
                >
                  {isLoading ? t('analyzing') : t('analyze')}
                  <Send className="h-3 w-3" />
                </button>
              </div>
            </div>
          </div>

          <div className="glass-card-low mb-2.5 rounded-[0.9rem] border border-white/8 p-2.5">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-600">Session</p>
            <div className="space-y-1.5 text-[11px]">
              <div>
                <p className="text-zinc-500">Dataset</p>
                <p className="line-clamp-2 break-all font-mono text-[10px] text-cyan-100">{datasetRef || 'No dataset selected yet'}</p>
              </div>
              <div>
                <p className="text-zinc-500">Mode</p>
                <p className="text-[10px] text-white">{PERSONA_CONFIG[currentPersona].label}</p>
              </div>
            </div>
          </div>

          <div className="mb-2.5">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-600">{t('activePerson')}</p>
            <PersonaSwitcher current={currentPersona} onSwitch={switchPersona} />
          </div>

          <button
            onClick={startFreshConversation}
            className="mb-2.5 flex h-8 items-center justify-center gap-1.5 rounded-[0.85rem] border border-white/10 bg-white/[0.03] text-[10px] font-semibold text-zinc-300 transition-all hover:border-cyan-300/20 hover:bg-cyan-400/8 hover:text-white"
          >
            <RotateCcw size={12} />
            Start Fresh
          </button>

          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-600">{t('tryAsking')}</p>
            <div className="space-y-1">
              {examples.slice(0, 3).map((q, i) => (
                <button key={i} onClick={() => processQuery(q)} className="confusion-btn w-full px-2 py-1.5 text-left text-[9px] leading-snug">
                  "{q}"
                </button>
              ))}
            </div>
          </div>
        </div>
      </aside>

      <section className="relative flex h-full min-h-0 min-w-0 flex-col bg-[radial-gradient(circle_at_top,rgba(77,226,255,0.04),transparent_18%),radial-gradient(circle_at_top_right,rgba(180,108,255,0.07),transparent_22%),linear-gradient(180deg,#05070a_0%,#06080d_100%)]">
        <div className="border-b border-white/6 px-4 py-2.5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-zinc-600">Conversation</p>
              <h2 className="mt-1 text-[0.95rem] font-semibold text-white">Bolt Analysis Chat</h2>
            </div>
            {inspectedMessage?.response && (
              <div className="rounded-full border border-cyan-300/10 bg-cyan-400/8 px-2 py-1 text-[8px] font-semibold uppercase tracking-[0.18em] text-cyan-100">
                Details Open
              </div>
            )}
          </div>
        </div>

        <div ref={messageListRef} onScroll={handleScroll} className="custom-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center px-8 text-center fade-in">
              <div className="glass-card-high mb-4 flex h-14 w-14 items-center justify-center pulse-glow">
                <Sparkles className="h-7 w-7 text-cyan-300" />
              </div>
              <h2 className="compact-title mb-2 text-[1.45rem] font-semibold text-white">{t('readyToAnalyze')}</h2>
              <p className="mb-5 max-w-md text-[13px] leading-relaxed text-zinc-400">
                {t('readyDescription')} <strong className="text-white">{PERSONA_CONFIG[currentPersona].label}</strong>.
              </p>
            </div>
          ) : (
            <div className="mx-auto flex w-full max-w-[min(860px,78ch)] min-w-0 flex-col gap-2.5">
              {isRestoring && (
                <div className="flex items-center justify-center gap-2 py-2 text-[11px] text-zinc-500 animate-pulse">
                  <Clock size={12} />
                  {t('loadingEarlier')}
                </div>
              )}
              {!isRestoring && hasMoreHistory && (
                <button
                  onClick={loadMoreHistory}
                  className="flex items-center justify-center gap-2 py-2 text-[11px] font-semibold text-violet-300 transition-colors hover:text-violet-200"
                >
                  <RotateCcw size={12} />
                  {t('loadEarlier')}
                </button>
              )}

              {messages.map((message) => (
                <MessageBubble
                  key={message.id}
                  message={message}
                  onActionClick={processQuery}
                  onInspect={handleInspectMessage}
                  isInspected={inspectedMessage?.id === message.id}
                />
              ))}
              <div ref={endRef} />
            </div>
          )}
        </div>
      </section>

      <ChatInspectorPanel
        selectedMessage={inspectedMessage}
        datasetRef={datasetRef}
        datasetSchema={datasetSchema}
        currentPersona={currentPersona}
      />
    </div>
  );
};
