import React from 'react';
import type { ConfidenceState } from '../../types';
import { CheckCircle2, AlertCircle, Eye } from 'lucide-react';

interface ConfidenceBadgeProps {
  status: ConfidenceState;
}

export const ConfidenceBadge: React.FC<ConfidenceBadgeProps> = ({ status }) => {
  const config: Record<ConfidenceState, { icon: React.ReactNode; bg: string; text: string; label: string }> = {
    Verified: {
      icon: <CheckCircle2 size={13} />,
      bg: 'bg-[linear-gradient(135deg,rgba(16,185,129,0.2),rgba(34,197,94,0.1))] border border-emerald-400/18 shadow-[0_0_16px_rgba(16,185,129,0.12)]',
      text: 'text-emerald-200',
      label: 'Verified',
    },
    Estimated: {
      icon: <AlertCircle size={13} />,
      bg: 'bg-[linear-gradient(135deg,rgba(251,191,36,0.18),rgba(245,158,11,0.1))] border border-amber-400/18 shadow-[0_0_16px_rgba(251,191,36,0.12)]',
      text: 'text-amber-200',
      label: 'Estimated',
    },
    Transparent: {
      icon: <Eye size={13} />,
      bg: 'bg-[linear-gradient(135deg,rgba(255,255,255,0.07),rgba(77,226,255,0.06))] border border-white/10',
      text: 'text-zinc-300',
      label: 'Transparent',
    },
  };

  const { icon, bg, text, label } = config[status];

  return (
    <div
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[10px] font-semibold shadow-sm ${bg} ${text}`}
      style={{ border: 'none' }}
      title={status === 'Transparent' ? 'Some data may be missing or inferred' : undefined}
    >
      {icon}
      {label}
    </div>
  );
};
