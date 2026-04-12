import React, { useState, useEffect } from 'react';
import { useAppContext } from '../stores/appStore';
import { Sparkles } from 'lucide-react';
import type { OnboardingAnswers, Persona } from '../types';
import { getUserId } from '../services/sessionService';
import { useTranslation } from 'react-i18next';

const CHAT_API_URL = import.meta.env.VITE_CHAT_API_URL || 'http://localhost:5000';

// ================================================================
// ================================================================
// QUESTION DATA
// ================================================================

interface QuestionOption { key: string; icon: string; labelKey: string; subtitleKey: string; }
interface Question { id: string; promptKey: string; options: QuestionOption[]; }

const SLIDE_1_QUESTIONS: Question[] = [
  {
    id: 'audience',
    promptKey: 'onboarding.q1Prompt',
    options: [
      { key: 'me',         icon: '🙋', labelKey: 'onboarding.q1A1Label', subtitleKey: 'onboarding.q1A1Sub' },
      { key: 'team',       icon: '👥', labelKey: 'onboarding.q1A2Label', subtitleKey: 'onboarding.q1A2Sub' },
      { key: 'board',      icon: '📊', labelKey: 'onboarding.q1A3Label', subtitleKey: 'onboarding.q1A3Sub' },
      { key: 'regulators', icon: '🔒', labelKey: 'onboarding.q1A4Label', subtitleKey: 'onboarding.q1A4Sub' },
    ],
  },
  {
    id: 'trust',
    promptKey: 'onboarding.q2Prompt',
    options: [
      { key: 'actionable', icon: '✅', labelKey: 'onboarding.q2A1Label', subtitleKey: 'onboarding.q2A1Sub' },
      { key: 'trend',      icon: '📈', labelKey: 'onboarding.q2A2Label', subtitleKey: 'onboarding.q2A2Sub' },
      { key: 'raw_math',   icon: '🔢', labelKey: 'onboarding.q2A3Label', subtitleKey: 'onboarding.q2A3Sub' },
    ],
  },
];

const SLIDE_2_QUESTIONS: Question[] = [
  {
    id: 'instinct',
    promptKey: 'onboarding.q3Prompt',
    options: [
      { key: 'fix',     icon: '⚡', labelKey: 'onboarding.q3A1Label', subtitleKey: 'onboarding.q3A1Sub' },
      { key: 'explain', icon: '🔍', labelKey: 'onboarding.q3A2Label', subtitleKey: 'onboarding.q3A2Sub' },
      { key: 'verify',  icon: '🧪', labelKey: 'onboarding.q3A3Label', subtitleKey: 'onboarding.q3A3Sub' },
    ],
  },
  {
    id: 'visual',
    promptKey: 'onboarding.q4Prompt',
    options: [
      { key: 'gauge', icon: '🎯', labelKey: 'onboarding.q4A1Label', subtitleKey: 'onboarding.q4A1Sub' },
      { key: 'line',  icon: '📉', labelKey: 'onboarding.q4A2Label', subtitleKey: 'onboarding.q4A2Sub' },
      { key: 'table', icon: '📋', labelKey: 'onboarding.q4A3Label', subtitleKey: 'onboarding.q4A3Sub' },
    ],
  },
];

// ================================================================
// PERSONA RESOLUTION FROM BACKEND
// ================================================================

async function fetchPersonaFromBackend(answers: Record<string, string>, datasetRef: string | null): Promise<Persona> {
  const payload = {
    responses: Object.entries(answers).map(([id, value]) => ({ id, value })),
    user_id: getUserId(),
    datasetRef
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
  const { completeOnboarding, setAppView, setOnboardingAnswers, datasetRef } = useAppContext();
  const { t } = useTranslation();
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
      const persona = await fetchPersonaFromBackend(answers, datasetRef);
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
            {slide === 0 ? t('onboarding.step1') : t('onboarding.step2')}
          </p>
          <p className="text-xs text-slate-400">{t('onboarding.tailorNote')}</p>
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
            {isSubmitting ? t('onboarding.configuring') : (slide === 0 ? t('onboarding.continueBtn') : t('onboarding.enterAppBtn'))}
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
  const { t } = useTranslation();
  const typewriterText = useTypewriter(t(question.promptKey), 22);

  return (
    <div className="fade-in-up">
      <h3 className="text-lg font-semibold text-slate-700 mb-4 min-h-[1.75rem]">{typewriterText}</h3>
      <div className="grid gap-3">
        {question.options.map(opt => {
          // Remove emoji from translated string since t() doesn't need to translate standard emojis, but we keep it here for layout.
          // Wait, the en.json has emojis in the strings. Let's just use what t() returns.
          // Actually I provided emoji in translation string itself. Let's just use t().
          return (
            <button
              key={opt.key}
              onClick={() => onSelect(opt.key)}
              className={`option-pill flex flex-col gap-0.5 ${selected === opt.key ? 'selected' : ''}`}
            >
              <span className="font-medium">{t(opt.labelKey)}</span>
              <span className="text-xs text-slate-400">{t(opt.subtitleKey)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
