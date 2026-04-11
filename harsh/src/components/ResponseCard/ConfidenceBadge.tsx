import React from 'react';
import type { ConfidenceState } from '../../types';
import { CheckCircle2, AlertCircle, Eye } from 'lucide-react';

interface ConfidenceBadgeProps {
  status: ConfidenceState;
}

export const ConfidenceBadge: React.FC<ConfidenceBadgeProps> = ({ status }) => {
  const config: Record<ConfidenceState, { icon: React.ReactNode; bg: string; text: string; label: string }> = {
    Verified:    { icon: <CheckCircle2 size={13} />, bg: 'bg-emerald-50', text: 'text-emerald-600', label: 'Verified' },
    Estimated:   { icon: <AlertCircle size={13} />,  bg: 'bg-amber-50',   text: 'text-amber-600',  label: 'Estimated' },
    Transparent: { icon: <Eye size={13} />,           bg: 'bg-slate-100',  text: 'text-slate-500',  label: 'Transparent' },
  };

  const { icon, bg, text, label } = config[status];

  return (
    <div
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full ${bg} ${text} text-xs font-semibold shadow-sm`}
      style={{ border: 'none' }}
      title={status === 'Transparent' ? 'Some data may be missing or inferred' : undefined}
    >
      {icon}
      {label}
    </div>
  );
};
