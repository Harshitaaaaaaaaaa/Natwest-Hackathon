import React, { useState, useEffect } from 'react';
import { useAppContext } from '../stores/appStore';
import { Sparkles } from 'lucide-react';
import type { OnboardingAnswers, Persona } from '../types';

const CHAT_API_URL = import.meta.env.VITE_CHAT_API_URL || 'http://localhost:3001';

// ================================================================
// QUESTION DATA
// ================================================================

interface QuestionOption { key: string; label: string; subtitle: string; }
interface Question { id: string; prompt: string; options: QuestionOption[]; }

const SLIDE_1_QUESTIONS: Question[] = [
  {
    id: 'audience',
    prompt: 'When you discover something important in your data, who depends on it most?',
    options: [
      { key: 'me',         label: '🙋  Just me',                  subtitle: 'Personal learning & decisions' },
      { key: 'team',       label: '👥  My team or clients',        subtitle: 'Operational & team reporting' },
      { key: 'board',      label: '📊  The Board or leadership',   subtitle: 'Strategic decision-making' },
      { key: 'regulators', label: '🔒  Regulators or auditors',    subtitle: 'Compliance & accountability' },
    ],
  },
  {
    id: 'trust',
    prompt: 'What convinces you that a data result is reliable?',
    options: [
      { key: 'actionable', label: '✅  It\'s easy to act on',          subtitle: 'Outcome-driven thinking' },
      { key: 'trend',      label: '📈  It matches trends I expect',    subtitle: 'Pattern-driven thinking' },
      { key: 'raw_math',   label: '🔢  I can see the source and math', subtitle: 'Evidence-driven thinking' },
    ],
  },
];

const SLIDE_2_QUESTIONS: Question[] = [
  {
    id: 'instinct',
    prompt: 'A key metric just dropped 20%. Your first instinct is to:',
    options: [
      { key: 'fix',     label: '⚡  Fix it immediately',      subtitle: 'Action-first approach' },
      { key: 'explain', label: '🔍  Understand what changed',  subtitle: 'Insight-first approach' },
      { key: 'verify',  label: '🧪  Check if the data is right', subtitle: 'Validation-first approach' },
    ],
  },
  {
    id: 'visual',
    prompt: 'How do you prefer to grasp the big picture at a glance?',
    options: [
      { key: 'gauge', label: '🎯  A simple Red / Yellow / Green signal', subtitle: 'Instant status read' },
      { key: 'line',  label: '📉  A trend line with clear direction',    subtitle: 'Change over time' },
      { key: 'table', label: '📋  A full table with all the numbers',    subtitle: 'Complete detail' },
    ],
  },
];

// ================================================================
// PERSONA RESOLUTION FROM BACKEND
// ================================================================

async function fetchPersonaFromBackend(answers: Record<string, string>): Promise<Persona> {
  const payload = {
    responses: Object.entries(answers).map(([id, value]) => ({ id, value }))
  };

  try {
    const res = await fetch(`${CHAT_API_URL}/api/questionnaire`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      const data = await res.json();
      return data.user_type as Persona;
    }
  } catch (error) {
    console.warn('[Onboarding] Backend unavailable, using local fallback.');
  }

  // Local Fallback if backend is down
  const { audience, trust, instinct } = answers as any as OnboardingAnswers;
  if (audience === 'regulators') return 'Compliance';
  if (audience === 'me' && (trust === 'raw_math' || instinct === 'verify')) return 'Analyst';
  if (audience === 'board') return 'Executive';
  if (audience === 'team' && (instinct === 'fix' || instinct === 'explain')) return 'SME';
  if (audience === 'me' && (trust === 'actionable' || trust === 'trend')) return 'Everyday';
  if (audience === 'team') return 'Everyday';
  return 'Beginner';
}

// ================================================================
// TYPEWRITER HOOK
// ================================================================

function useTypewriter(text: string, speed = 28) {
  const [displayed, setDisplayed] = useState('');
  useEffect(() => {
    setDisplayed('');
    let i = 0;
    const interval = setInterval(() => {
      if (i < text.length) { setDisplayed(text.slice(0, i + 1)); i++; }
      else clearInterval(interval);
    }, speed);
    return () => clearInterval(interval);
  }, [text, speed]);
  return displayed;
}

// ================================================================
// MAIN COMPONENT
// ================================================================

export const Onboarding: React.FC = () => {
  const { completeOnboarding, setAppView, setOnboardingAnswers } = useAppContext();
  const [slide, setSlide] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const currentQuestions = slide === 0 ? SLIDE_1_QUESTIONS : SLIDE_2_QUESTIONS;
  const progress = slide === 0 ? 50 : 100;
  const canProceed = currentQuestions.every(q => answers[q.id]);

  const handleSelect = (questionId: string, optionKey: string) =>
    setAnswers(prev => ({ ...prev, [questionId]: optionKey }));

  const handleNext = async () => {
    if (slide === 0) {
      setSlide(1);
    } else {
      setIsSubmitting(true);
      const finalAnswers: OnboardingAnswers = {
        audience: answers.audience as any,
        trust: answers.trust as any,
        instinct: answers.instinct as any,
        visual: answers.visual as any,
      };
      const persona = await fetchPersonaFromBackend(answers);
      setOnboardingAnswers(finalAnswers);
      completeOnboarding(finalAnswers, persona);
      setAppView('transition');
    }
  };

  return (
    <div className="flex flex-col items-center w-full h-full p-8 relative overflow-y-auto custom-scrollbar">

      {/* Progress bar */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-slate-100/50 overflow-hidden" style={{ borderRadius: '40px 40px 0 0' }}>
        <div
          className="h-full bg-gradient-to-r from-blue-400 to-violet-400 transition-all duration-700 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="max-w-2xl w-full fade-in-up" key={slide}>
        {/* Header */}
        <div className="text-center mb-8 mt-6">
          <div className="w-12 h-12 glass-card-high mx-auto mb-4 flex items-center justify-center pulse-glow">
            <Sparkles className="w-6 h-6 text-blue-500" />
          </div>
          <p className="text-sm font-medium text-slate-400 uppercase tracking-widest mb-1">
            {slide === 0 ? 'Step 1 of 2 — Who you are' : 'Step 2 of 2 — How you think'}
          </p>
          <p className="text-xs text-slate-400">Your answers tailor every chart, explanation, and insight.</p>
        </div>

        {/* Questions */}
        <div className="space-y-8 stagger">
          {currentQuestions.map(q => (
            <QuestionBlock
              key={q.id}
              question={q}
              selected={answers[q.id] ?? null}
              onSelect={key => handleSelect(q.id, key)}
            />
          ))}
        </div>

        {/* Next / Finish */}
        <div className="mt-8 mb-8 text-center fade-in-up" style={{ animationDelay: '400ms' }}>
          <button
            onClick={handleNext}
            disabled={!canProceed || isSubmitting}
            className="glass-card px-10 py-4 text-lg font-semibold text-slate-700 disabled:opacity-30 disabled:cursor-not-allowed hover:text-blue-600 transition-all"
          >
            {isSubmitting ? 'Configuring Persona...' : (slide === 0 ? 'Continue →' : 'Enter Talk2Data →')}
          </button>
        </div>
      </div>
    </div>
  );
};

// ================================================================
// QUESTION BLOCK
// ================================================================

const QuestionBlock: React.FC<{
  question: Question;
  selected: string | null;
  onSelect: (key: string) => void;
}> = ({ question, selected, onSelect }) => {
  const typewriterText = useTypewriter(question.prompt, 22);

  return (
    <div className="fade-in-up">
      <h3 className="text-lg font-semibold text-slate-700 mb-4 min-h-[1.75rem]">{typewriterText}</h3>
      <div className="grid gap-3">
        {question.options.map(opt => (
          <button
            key={opt.key}
            onClick={() => onSelect(opt.key)}
            className={`option-pill flex flex-col gap-0.5 ${selected === opt.key ? 'selected' : ''}`}
          >
            <span className="font-medium">{opt.label}</span>
            <span className="text-xs text-slate-400">{opt.subtitle}</span>
          </button>
        ))}
      </div>
    </div>
  );
};
