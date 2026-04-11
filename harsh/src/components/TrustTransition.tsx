import React, { useEffect, useState } from 'react';
import { useAppContext } from '../stores/appStore';
import { Shield } from 'lucide-react';
import type { Persona } from '../types';

const TRANSITION_MESSAGES: Record<Persona, string[]> = {
  Beginner: [
    'Understanding your learning style...',
    'Configuring a warm, guided experience...',
    'Ready. Every insight will be explained simply.',
  ],
  Everyday: [
    'Mapping your workflow preferences...',
    'Setting up quick, practical answers...',
    'Ready. Your workspace is optimized for speed and clarity.',
  ],
  SME: [
    'Detecting your operational context...',
    'Configuring KPI dashboards and driver breakdowns...',
    'Ready. Your workspace is set for team-level insights.',
  ],
  Executive: [
    'Understanding your strategic priorities...',
    'Configuring impact-first, signal-over-noise analysis...',
    'Ready. Your workspace is tailored for strategic impact.',
  ],
  Analyst: [
    'Preparing full-detail analysis mode...',
    'Loading exact values, filters, and decomposition views...',
    'Ready. Your workspace is in Analyst power mode.',
  ],
  Compliance: [
    'Activating forensic audit mode...',
    'Configuring full source trails, timestamps, and traceability...',
    'Ready. All outputs are audit-ready and policy-mapped.',
  ],
};

export const TrustTransition: React.FC = () => {
  const { currentPersona, setAppView } = useAppContext();
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
    <div className="flex flex-col items-center justify-center w-full h-full p-8">
      <div className="max-w-md w-full text-center space-y-8">

        {/* Animated icon */}
        <div className="w-16 h-16 glass-card-high mx-auto flex items-center justify-center pulse-glow">
          <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-400 to-violet-500 animate-pulse" />
        </div>

        {/* Step messages */}
        <div className="space-y-4 min-h-[120px]">
          {msgs.map((msg, i) => (
            <p
              key={i}
              className={`text-lg font-medium transition-all duration-700 ${
                i <= step ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
              } ${i === step ? 'text-slate-800' : 'text-slate-400'}`}
              style={{ transitionDelay: `${i * 100}ms` }}
            >
              {msg}
            </p>
          ))}
        </div>

        {/* Trust note */}
        <div
          className={`glass-card-low p-4 flex items-center gap-3 text-sm text-slate-500 transition-all duration-500 ${
            step >= 2 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
          }`}
        >
          <Shield className="w-5 h-5 text-emerald-500 shrink-0" />
          <span>
            Same data. Different presentation. Adapted exactly for your role.
          </span>
        </div>
      </div>
    </div>
  );
};
