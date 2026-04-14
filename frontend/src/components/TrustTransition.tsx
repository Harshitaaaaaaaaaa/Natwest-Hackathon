import React, { useEffect, useState } from 'react';
import { Shield } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAppContext } from '../stores/appStore';
import type { Persona } from '../types';

const TRANSITION_MESSAGES: Record<Persona, string[]> = {
  Beginner: ['transition.understanding', 'transition.warm', 'transition.readySimple'],
  Everyday: ['transition.workflow', 'transition.practical', 'transition.readySpeed'],
  SME: ['transition.operational', 'transition.kpi', 'transition.readyTeam'],
  Executive: ['transition.strategic', 'transition.impact', 'transition.readyImpact'],
  Analyst: ['transition.detail', 'transition.exact', 'transition.readyAnalyst'],
  Compliance: ['transition.forensic', 'transition.trails', 'transition.readyAudit'],
};

export const TrustTransition: React.FC = () => {
  const { currentPersona, setAppView } = useAppContext();
  const { t } = useTranslation();
  const [step, setStep] = useState(0);
  const msgs = TRANSITION_MESSAGES[currentPersona] ?? TRANSITION_MESSAGES.Beginner;

  useEffect(() => {
    const timers = [
      setTimeout(() => setStep(1), 1200),
      setTimeout(() => setStep(2), 2800),
      setTimeout(() => setAppView('chat'), 4600),
    ];

    return () => timers.forEach(clearTimeout);
  }, [setAppView]);

  return (
    <div className="flex h-full w-full items-center justify-center bg-black px-4 py-8">
      <div className="w-full max-w-xl rounded-[2rem] border border-white/10 bg-white/[0.03] px-6 py-10 text-center shadow-[0_30px_80px_rgba(0,0,0,0.45)] backdrop-blur-2xl md:px-10">
        <div className="mx-auto mb-8 flex h-16 w-16 items-center justify-center rounded-3xl border border-violet-400/20 bg-violet-500/10 shadow-[0_0_30px_rgba(168,85,247,0.18)]">
          <div className="h-7 w-7 rounded-full bg-gradient-to-br from-cyan-400 to-violet-500 animate-pulse" />
        </div>

        <div className="min-h-[132px] space-y-4">
          {msgs.map((msg, i) => (
            <p
              key={i}
              className={`text-lg font-medium transition-all duration-700 ${
                i <= step ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
              } ${i === step ? 'text-white' : 'text-zinc-500'}`}
              style={{ transitionDelay: `${i * 100}ms` }}
            >
              {t(msg)}
            </p>
          ))}
        </div>

        <div
          className={`mt-8 flex items-center gap-3 rounded-[1.5rem] border border-emerald-400/15 bg-white/[0.02] p-4 text-left text-sm text-zinc-400 transition-all duration-500 ${
            step >= 2 ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
          }`}
        >
          <Shield className="h-5 w-5 shrink-0 text-emerald-300" />
          <span>{t('transition.trustNote')}</span>
        </div>
      </div>
    </div>
  );
};
