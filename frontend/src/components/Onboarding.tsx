import React, { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { buildApiUrl } from '../config/api';
import { getUserId } from '../services/sessionService';
import { useAppContext } from '../stores/appStore';
import type { OnboardingAnswers, Persona } from '../types';

interface QuestionOption {
  key: string;
  icon: string;
  labelKey: string;
  subtitleKey: string;
}

interface Question {
  id: string;
  promptKey: string;
  options: QuestionOption[];
}

const SLIDE_1_QUESTIONS: Question[] = [
  {
    id: 'audience',
    promptKey: 'onboarding.q1Prompt',
    options: [
      { key: 'me', icon: 'ME', labelKey: 'onboarding.q1A1Label', subtitleKey: 'onboarding.q1A1Sub' },
      { key: 'team', icon: 'TM', labelKey: 'onboarding.q1A2Label', subtitleKey: 'onboarding.q1A2Sub' },
      { key: 'board', icon: 'BD', labelKey: 'onboarding.q1A3Label', subtitleKey: 'onboarding.q1A3Sub' },
      { key: 'regulators', icon: 'RG', labelKey: 'onboarding.q1A4Label', subtitleKey: 'onboarding.q1A4Sub' },
    ],
  },
  {
    id: 'trust',
    promptKey: 'onboarding.q2Prompt',
    options: [
      { key: 'actionable', icon: 'OK', labelKey: 'onboarding.q2A1Label', subtitleKey: 'onboarding.q2A1Sub' },
      { key: 'trend', icon: 'TR', labelKey: 'onboarding.q2A2Label', subtitleKey: 'onboarding.q2A2Sub' },
      { key: 'raw_math', icon: 'NM', labelKey: 'onboarding.q2A3Label', subtitleKey: 'onboarding.q2A3Sub' },
    ],
  },
];

const SLIDE_2_QUESTIONS: Question[] = [
  {
    id: 'instinct',
    promptKey: 'onboarding.q3Prompt',
    options: [
      { key: 'fix', icon: 'FX', labelKey: 'onboarding.q3A1Label', subtitleKey: 'onboarding.q3A1Sub' },
      { key: 'explain', icon: 'EX', labelKey: 'onboarding.q3A2Label', subtitleKey: 'onboarding.q3A2Sub' },
      { key: 'verify', icon: 'VR', labelKey: 'onboarding.q3A3Label', subtitleKey: 'onboarding.q3A3Sub' },
    ],
  },
  {
    id: 'visual',
    promptKey: 'onboarding.q4Prompt',
    options: [
      { key: 'gauge', icon: 'GG', labelKey: 'onboarding.q4A1Label', subtitleKey: 'onboarding.q4A1Sub' },
      { key: 'line', icon: 'LN', labelKey: 'onboarding.q4A2Label', subtitleKey: 'onboarding.q4A2Sub' },
      { key: 'table', icon: 'TB', labelKey: 'onboarding.q4A3Label', subtitleKey: 'onboarding.q4A3Sub' },
    ],
  },
];

async function fetchPersonaFromBackend(answers: Record<string, string>, datasetRef: string | null): Promise<Persona> {
  const payload = {
    responses: Object.entries(answers).map(([id, value]) => ({ id, value })),
    user_id: getUserId(),
    datasetRef,
  };

  try {
    const res = await fetch(buildApiUrl('/api/questionnaire'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      const data = await res.json();
      return data.user_type as Persona;
    }
  } catch (error) {
    console.warn('[Onboarding] Backend unavailable, using local fallback.');
  }

  const { audience, trust, instinct } = answers as unknown as OnboardingAnswers;
  if (audience === 'regulators') return 'Compliance';
  if (audience === 'me' && (trust === 'raw_math' || instinct === 'verify')) return 'Analyst';
  if (audience === 'board') return 'Executive';
  if (audience === 'team' && (instinct === 'fix' || instinct === 'explain')) return 'SME';
  if (audience === 'me' && (trust === 'actionable' || trust === 'trend')) return 'Everyday';
  if (audience === 'team') return 'Everyday';
  return 'Beginner';
}

function useTypewriter(text: string, speed = 28) {
  const [displayed, setDisplayed] = useState('');

  useEffect(() => {
    setDisplayed('');
    let i = 0;
    const interval = setInterval(() => {
      if (i < text.length) {
        setDisplayed(text.slice(0, i + 1));
        i += 1;
      } else {
        clearInterval(interval);
      }
    }, speed);

    return () => clearInterval(interval);
  }, [text, speed]);

  return displayed;
}

export const Onboarding: React.FC = () => {
  const { completeOnboarding, setAppView, setOnboardingAnswers, datasetRef } = useAppContext();
  const { t } = useTranslation();
  const [slide, setSlide] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const currentQuestions = slide === 0 ? SLIDE_1_QUESTIONS : SLIDE_2_QUESTIONS;
  const progress = slide === 0 ? 50 : 100;
  const canProceed = currentQuestions.every((q) => answers[q.id]);

  const handleSelect = (questionId: string, optionKey: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: optionKey }));
  };

  const handleNext = async () => {
    if (slide === 0) {
      setSlide(1);
      return;
    }

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
  };

  return (
    <div className="flex h-full w-full items-center justify-center overflow-y-auto bg-black px-4 py-6 custom-scrollbar md:px-6">
      <div className="w-full max-w-2xl overflow-hidden rounded-[1.25rem] border border-cyan-300/8 bg-white/[0.03] shadow-[0_24px_60px_rgba(0,0,0,0.45)] backdrop-blur-2xl">
        <div className="h-1 w-full bg-white/[0.05]">
          <div
            className="h-full bg-gradient-to-r from-cyan-400 via-violet-500 to-fuchsia-500 transition-all duration-700 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="px-4 py-5 md:px-5 md:py-5" key={slide}>
          <div className="mb-5 mt-1 text-center">
            <div className="mx-auto mb-2.5 flex h-10 w-10 items-center justify-center rounded-[0.9rem] border border-cyan-300/15 bg-cyan-400/10 shadow-[0_0_24px_rgba(77,226,255,0.14)]">
              <Sparkles className="h-4 w-4 text-cyan-300" />
            </div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.28em] text-zinc-500">
              {slide === 0 ? t('onboarding.step1') : t('onboarding.step2')}
            </p>
            <p className="text-[12px] text-zinc-400">{t('onboarding.tailorNote')}</p>
          </div>

          <div className="space-y-5 stagger">
            {currentQuestions.map((q) => (
              <QuestionBlock
                key={q.id}
                question={q}
                selected={answers[q.id] ?? null}
                onSelect={(key) => handleSelect(q.id, key)}
              />
            ))}
          </div>

          <div className="mt-6 text-center">
            <button
              onClick={handleNext}
              disabled={!canProceed || isSubmitting}
              className="h-9 rounded-[0.9rem] bg-[linear-gradient(90deg,#26d9ff_0%,#6ea6ff_38%,#a85cff_72%,#cf78ff_100%)] px-6 text-[13px] font-semibold text-white shadow-[0_0_20px_rgba(77,226,255,0.14),0_0_18px_rgba(180,108,255,0.14)] transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500"
            >
              {isSubmitting
                ? t('onboarding.configuring')
                : slide === 0
                  ? t('onboarding.continueBtn')
                  : t('onboarding.enterAppBtn')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const QuestionBlock: React.FC<{
  question: Question;
  selected: string | null;
  onSelect: (key: string) => void;
}> = ({ question, selected, onSelect }) => {
  const { t } = useTranslation();
  const typewriterText = useTypewriter(t(question.promptKey), 22);

  return (
    <div className="fade-in-up">
      <h3 className="mb-2.5 min-h-[1.4rem] text-[14px] font-semibold text-white">{typewriterText}</h3>
      <div className="grid gap-2">
        {question.options.map((opt) => (
          <button
            key={opt.key}
            onClick={() => onSelect(opt.key)}
            className={`flex items-start gap-2.5 rounded-[0.95rem] border px-3 py-2.5 text-left transition-all ${
              selected === opt.key
                ? 'border-violet-400/30 bg-violet-500/10 shadow-[0_0_24px_rgba(168,85,247,0.14)]'
                : 'border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]'
            }`}
          >
            <div
              className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[0.75rem] text-[9px] font-bold tracking-[0.18em] ${
                selected === opt.key ? 'bg-violet-400/15 text-violet-200' : 'bg-white/[0.06] text-zinc-500'
              }`}
            >
              {opt.icon}
            </div>
            <div className="min-w-0">
              <span className="block text-[12px] font-medium text-white">{t(opt.labelKey)}</span>
              <span className="mt-0.5 block text-[10px] leading-relaxed text-zinc-400">{t(opt.subtitleKey)}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};
