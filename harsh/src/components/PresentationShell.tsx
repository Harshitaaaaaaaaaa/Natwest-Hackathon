import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  Send, Sparkles, Database, Mic, VolumeX, Volume2,
  ChevronDown, Users, BarChart2, Brain, Shield, Eye, Zap, RotateCcw, Clock, LogOut
} from 'lucide-react';
import { useAppContext } from '../stores/appStore';
import { classifyIntent } from '../services/geminiService';
import { getInsightResponse } from '../services/insightAdapter';
import { buildResponseFromInsight } from '../utils/responseMapper';
import { MessageBubble } from './ChatLayout/MessageBubble';
import { newMessageId } from '../services/sessionService';
import type { Persona } from '../types';

// ================================================================
// PERSONA CONFIG — icons, colors, descriptions
// ================================================================

interface PersonaConfig {
  icon: React.ReactNode;
  label: string;
  description: string;
  color: string;
}

const PERSONA_CONFIG: Record<Persona, PersonaConfig> = {
  Beginner: {
    icon: <Eye size={15} />,
    label: 'Guided Mode',
    description: 'Simple explanations, one chart',
    color: 'persona-beginner',
  },
  Everyday: {
    icon: <Zap size={15} />,
    label: 'Quick View',
    description: 'Fast, practical answers',
    color: 'persona-everyday',
  },
  SME: {
    icon: <Users size={15} />,
    label: 'Ops Mode',
    description: 'KPIs, drivers, team context',
    color: 'persona-sme',
  },
  Executive: {
    icon: <BarChart2 size={15} />,
    label: 'Executive View',
    description: 'Impact-first, strategic signal',
    color: 'persona-executive',
  },
  Analyst: {
    icon: <Brain size={15} />,
    label: 'Analyst Mode',
    description: 'Full decomposition, exact data',
    color: 'persona-analyst',
  },
  Compliance: {
    icon: <Shield size={15} />,
    label: 'Audit/Compliance',
    description: 'Traceable, auditable, sourced',
    color: 'persona-compliance',
  },
};

// ================================================================
// EXAMPLE QUERIES — persona-aware
// ================================================================

const EXAMPLE_QUERIES: Record<Persona, string[]> = {
  Beginner: [
    'How is my data looking?',
    'Is everything okay this month?',
    'What changed recently?',
  ],
  Everyday: [
    'How is revenue trending?',
    'What happened to Q3 numbers?',
    'Compare this month vs last month',
  ],
  SME: [
    'Show me the Q3 performance KPIs',
    'Compare Q2 vs Q3 spending by department',
    'Why did costs spike last quarter?',
  ],
  Executive: [
    'What is the bottom line on Q3?',
    'How does our margin compare to target?',
    'What is driving the revenue gap?',
  ],
  Analyst: [
    'Show exact quarterly revenue breakdown with deltas',
    'Compare cohort retention Q2 vs Q3 with statistical significance',
    'What are the top 5 drivers of the cost variance?',
  ],
  Compliance: [
    'Show auditable revenue figures for Q3 with source citations',
    'Compare GL entries for Q2 vs Q3 with rule references',
    'Document the cost variance with full audit trail',
  ],
};

// ================================================================
// PERSONA SWITCHER DROPDOWN
// ================================================================

interface PersonaSwitcherProps {
  current: Persona;
  onSwitch: (p: Persona) => void;
}

const PersonaSwitcher: React.FC<PersonaSwitcherProps> = ({ current, onSwitch }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const cfg = PERSONA_CONFIG[current];

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className={`persona-switcher-btn ${cfg.color} flex items-center gap-2`}
        title="Switch persona — re-renders all insights instantly"
      >
        {cfg.icon}
        <span className="font-semibold text-sm">{cfg.label}</span>
        <ChevronDown size={13} className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="persona-dropdown">
          <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider px-3 pt-3 pb-2">
            Switch Persona — re-renders instantly
          </p>
          {(Object.keys(PERSONA_CONFIG) as Persona[]).map(p => {
            const c = PERSONA_CONFIG[p];
            const isActive = p === current;
            return (
              <button
                key={p}
                onClick={() => { onSwitch(p); setOpen(false); }}
                className={`persona-dropdown-item ${isActive ? 'active' : ''}`}
              >
                <span className={`persona-dot ${c.color}`} />
                <div className="flex flex-col items-start">
                  <span className="font-semibold text-sm text-slate-700">{c.label}</span>
                  <span className="text-xs text-slate-400">{c.description}</span>
                </div>
                {isActive && (
                  <span className="ml-auto text-xs text-blue-500 font-semibold">Active</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ================================================================
// MAIN PRESENTATION SHELL
// ================================================================

export const PresentationShell: React.FC = () => {
  const {
    messages, addMessage, updateMessage,
    currentPersona, switchPersona,
    isLoading, setIsLoading,
    voiceMode, setVoiceMode,
    isRestoring, hasMoreHistory, loadMoreHistory,
    startFreshConversation, logoutUser,
  } = useAppContext();

  const [input, setInput] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const recognitionRef = useRef<any>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const messageListRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Scroll-back: load older messages when user scrolls to the top
  const handleScroll = useCallback(async () => {
    const el = messageListRef.current;
    if (!el || !hasMoreHistory || isRestoring) return;
    if (el.scrollTop < 80) {
      const prevScrollHeight = el.scrollHeight;
      await loadMoreHistory();
      // Keep scroll position stable after prepending older messages
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight - prevScrollHeight;
      });
    }
  }, [hasMoreHistory, isRestoring, loadMoreHistory]);

  // ── Core query pipeline ─────────────────────────────────────────
  const processQuery = async (queryText: string) => {
    if (!queryText.trim() || isLoading) return;

    const userMsgId = newMessageId();
    addMessage({ id: userMsgId, sender: 'user', text: queryText.trim(), rawQuery: queryText.trim() });

    const aiMsgId = newMessageId();
    addMessage({ id: aiMsgId, sender: 'ai', isLoading: true });
    setIsLoading(true);
    setInput('');

    try {
      // 1. Classify intent
      const intent = await classifyIntent(queryText, currentPersona);

      // --- Conversational Flow ---
      if (intent.query_type === 'Conversational') {
        const { handleConversationalQuery } = await import('../services/geminiService');
        const text = await handleConversationalQuery(queryText, currentPersona);
        updateMessage(aiMsgId, {
          isLoading: false,
          text,
          rawQuery: queryText,
        });
        return;
      }

      // --- Analytical Flow ---
      // 2. Get insight (MLOutputContract) from adapter
      const insight = await getInsightResponse(queryText, intent, currentPersona);

      // 3. Build persona-shaped rendered response
      const response = buildResponseFromInsight(currentPersona, insight);

      // 4. Store both the rendered response AND raw ML contract (for instant persona re-render)
      updateMessage(aiMsgId, {
        isLoading:  false,
        response,
        rawInsight: insight,   // MLOutputContract
        rawQuery:   queryText,
      });
    } catch (err) {
      console.error('[PresentationShell] processQuery failed:', err);
      updateMessage(aiMsgId, { isLoading: false, response: undefined });
    } finally {
      setIsLoading(false);
    }
  };

  const handleAnalyze = () => processQuery(input);
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAnalyze(); }
  };

  const toggleRecording = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Voice input is not supported in this browser. Please use Google Chrome or Edge.");
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
      setInput(''); // clear input box for fresh voice input
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

  const examples = EXAMPLE_QUERIES[currentPersona];

  return (
    <>
      {/* ── LEFT COLUMN (30%) ────────────────────────────────── */}
      <div className="w-[30%] h-full bg-white/40 backdrop-blur-sm flex flex-col relative">
        {/* Scrollable top/middle area */}
        <div className="flex-1 overflow-y-auto p-8 pb-4 custom-scrollbar flex flex-col">

          {/* Header row */}
        <div className="mb-5 flex justify-between items-start">
          <div>
            <div className="flex items-center gap-3 mb-1.5">
              <div className="w-9 h-9 glass-card flex items-center justify-center">
                <Database className="w-4 h-4 text-blue-500" />
              </div>
              <h1 className="text-xl font-bold text-slate-800 tracking-tight">Talk2Data</h1>
            </div>
            <p className="text-slate-500 text-xs leading-relaxed">
              Ask questions about your data in plain English.
            </p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => {
                if (voiceMode && 'speechSynthesis' in window) window.speechSynthesis.cancel();
                setVoiceMode(!voiceMode);
              }}
              className={`p-2 rounded-xl transition-all shadow-sm ${
                voiceMode ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-400 hover:text-blue-500 hover:bg-blue-50'
              }`}
              title="Toggle Voice Mode"
            >
              {voiceMode ? <Volume2 size={17} /> : <VolumeX size={17} />}
            </button>
            <button
              onClick={logoutUser}
              className="p-2 rounded-xl transition-all shadow-sm bg-slate-100 text-slate-400 hover:text-red-500 hover:bg-red-50"
              title="Logout / Switch User"
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>

        {/* Persona Switcher */}
        <div className="mb-5">
          <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider mb-2">
            Active Persona
          </p>
          <PersonaSwitcher current={currentPersona} onSwitch={switchPersona} />
          <p className="text-xs text-slate-400 mt-2 leading-snug">
            {PERSONA_CONFIG[currentPersona].description}. Switching re-renders all insights instantly — no new API call.
          </p>
        </div>

        {/* Text input */}
        <div className="glass-card-low p-4 mb-5" style={{ minHeight: '140px' }}>
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
            className="w-full h-full bg-transparent resize-y text-slate-700 text-sm placeholder:text-slate-400 font-light focus:outline-none"
            placeholder="e.g. Why did revenue drop in Q3?"
            style={{ border: 'none', minHeight: '100px' }}
          />
        </div>

        {/* Example queries */}
        <div className="mb-5 mt-auto">
          <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider mb-2">
            Try asking ({currentPersona})
          </p>
          <div className="space-y-1.5">
            {examples.map((q, i) => (
              <button
                key={i}
                onClick={() => processQuery(q)}
                className="confusion-btn w-full text-left text-xs py-2 px-3 leading-snug"
              >
                "{q}"
              </button>
            ))}
          </div>
        </div>
        </div>

        {/* Sticky Action buttons at the bottom */}
        <div className="p-8 pt-2 mt-auto shrink-0 bg-gradient-to-t from-white/90 to-transparent">
          <div className="flex gap-3">
            <button
            type="button"
            onClick={toggleRecording}
            className={`shrink-0 w-12 h-12 glass-card flex items-center justify-center transition-colors cursor-pointer ${
              isRecording ? 'text-red-500 animate-pulse border-red-200 bg-red-50' : 'text-slate-400 hover:text-blue-500'
            }`}
            title={isRecording ? "Recording... (click to stop)" : "Voice input (connect mic)"}
          >
            <Mic className="w-5 h-5" />
          </button>

          <button
            onClick={handleAnalyze}
            disabled={!input.trim() || isLoading}
            className="flex-1 h-12 bg-slate-800 hover:bg-slate-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-semibold rounded-2xl flex items-center justify-center gap-2.5 transition-all text-sm"
            style={{ border: 'none' }}
          >
            {isLoading ? 'Analyzing...' : 'Analyze'}
            <Send className="w-4 h-4" />
          </button>
          </div>
        </div>
      </div>

      {/* ── RIGHT COLUMN (70%) ───────────────────────────────── */}
      <div
        ref={messageListRef}
        onScroll={handleScroll}
        className="w-[70%] h-full bg-gradient-to-b from-slate-50/50 to-slate-100/30 overflow-y-auto relative custom-scrollbar"
      >

        {messages.length === 0 ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-12 fade-in">
            <div className="w-20 h-20 glass-card-high flex items-center justify-center mb-6 pulse-glow">
              <Sparkles className="w-10 h-10 text-amber-400" />
            </div>
            <h2 className="text-2xl font-bold text-slate-800 mb-3 tracking-tight">Ready to analyze</h2>
            <p className="text-slate-500 text-base max-w-md font-light leading-relaxed mb-6">
              Your insights, charts, and explanations appear here — shaped exactly for{' '}
              <strong className="text-slate-700">{PERSONA_CONFIG[currentPersona].label}</strong>.
            </p>

            {/* Persona demo chips */}
            <div className="flex flex-wrap gap-2 justify-center max-w-lg">
              {(Object.keys(PERSONA_CONFIG) as Persona[]).map(p => (
                <button
                  key={p}
                  onClick={() => switchPersona(p)}
                  className={`persona-chip persona-chip-${p.toLowerCase()} ${p === currentPersona ? 'ring-2 ring-blue-400' : 'opacity-60 hover:opacity-100'} transition-all`}
                  title={PERSONA_CONFIG[p].description}
                >
                  {PERSONA_CONFIG[p].icon}
                  {PERSONA_CONFIG[p].label}
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-400 mt-3">Switch persona to see the same insight rendered differently</p>
          </div>
        ) : (
          <div className="max-w-4xl mx-auto flex flex-col gap-4 pt-6 px-6 pb-20">

            {/* Scroll-back loader — appears at top when older messages exist */}
            {isRestoring && (
              <div className="flex items-center justify-center gap-2 py-3 text-slate-400 text-xs animate-pulse">
                <Clock size={13} />
                Loading earlier messages…
              </div>
            )}
            {!isRestoring && hasMoreHistory && (
              <button
                onClick={loadMoreHistory}
                className="flex items-center justify-center gap-2 py-2 text-blue-500 text-xs font-semibold hover:text-blue-700 transition-colors"
              >
                <RotateCcw size={12} />
                Load earlier messages
              </button>
            )}

            {messages.map(m => (
              <MessageBubble key={m.id} message={m} onActionClick={processQuery} />
            ))}
            <div ref={endRef} />
          </div>
        )}
      </div>
    </>
  );
};
