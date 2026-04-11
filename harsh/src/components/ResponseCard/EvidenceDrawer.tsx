import React, { useState } from 'react';
import type { EvidenceData } from '../../types';
import { ChevronDown, Database, Clock, Calculator, ShieldCheck, Filter, AlertTriangle } from 'lucide-react';

interface EvidenceDrawerProps {
  evidence: EvidenceData;
  defaultExpanded?: boolean;
  isCompliance?: boolean;
  isAnalyst?: boolean;
}

export const EvidenceDrawer: React.FC<EvidenceDrawerProps> = ({
  evidence,
  defaultExpanded = false,
  isCompliance = false,
  isAnalyst = false,
}) => {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const showRich = isCompliance || isAnalyst;

  return (
    <div className="mt-4 pt-3" style={{ borderTop: '1px solid rgba(226,232,240,0.5)' }}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="confusion-btn flex items-center gap-2"
      >
        <ChevronDown
          size={14}
          className={`transform transition-transform duration-300 ${expanded ? 'rotate-180' : ''}`}
        />
        {expanded ? 'Hide' : 'Show'} Evidence {isCompliance ? '& Audit Trail' : '& Metadata'}
      </button>

      <div
        className={`overflow-hidden transition-all duration-400 ease-in-out ${expanded ? 'max-h-[600px] opacity-100 mt-3' : 'max-h-0 opacity-0'}`}
      >
        <div className="glass-card-low p-5 text-xs text-slate-600 space-y-3">

          {/* Source */}
          <div className="flex flex-col gap-1">
            <span className="flex items-center gap-1.5 font-semibold text-slate-700">
              <Database size={12} /> Source
            </span>
            <span className="ml-5 font-mono text-slate-500">{evidence.source}</span>
          </div>

          {/* Timestamp */}
          <div className="flex flex-col gap-1">
            <span className="flex items-center gap-1.5 font-semibold text-slate-700">
              <Clock size={12} /> Timestamp
            </span>
            <span className="ml-5 font-mono text-slate-500">{new Date(evidence.timestamp).toLocaleString()}</span>
          </div>

          {/* Confidence */}
          <div className="flex flex-col gap-1">
            <span className="flex items-center gap-1.5 font-semibold text-slate-700">
              <ShieldCheck size={12} /> Confidence
            </span>
            <span className="ml-5">{(evidence.confidence * 100).toFixed(1)}%</span>
            <span className="ml-5 text-slate-400">{evidence.notes}</span>
          </div>

          {/* Filters (Analyst + Compliance) */}
          {evidence.filters && showRich && (
            <div className="flex flex-col gap-1">
              <span className="flex items-center gap-1.5 font-semibold text-slate-700">
                <Filter size={12} /> Query Filters
              </span>
              <code className="ml-5 glass-card-low px-3 py-1.5 text-blue-600 inline-block break-all text-xs">
                {evidence.filters}
              </code>
            </div>
          )}

          {/* Formula (Analyst + Compliance + Executive) */}
          {evidence.formula && (
            <div className="flex flex-col gap-1 pt-1">
              <span className="flex items-center gap-1.5 font-semibold text-slate-700">
                <Calculator size={12} /> Calculation Formula
              </span>
              <code className="ml-5 glass-card-low px-3 py-1.5 text-blue-600 inline-block break-all text-xs">
                {evidence.formula}
              </code>
            </div>
          )}

          {/* Audit Log (Compliance + Analyst) */}
          {evidence.auditLog && showRich && (
            <div className="flex flex-col gap-1 pt-1">
              <span className="flex items-center gap-1.5 font-semibold text-slate-700">
                <ShieldCheck size={12} /> Audit Trail
              </span>
              <span className="ml-5 font-mono text-slate-400 text-xs leading-relaxed break-all">{evidence.auditLog}</span>
            </div>
          )}

          {/* Limitations */}
          {evidence.limitations && evidence.limitations.length > 0 && (
            <div className="flex flex-col gap-1 pt-1">
              <span className="flex items-center gap-1.5 font-semibold text-amber-600">
                <AlertTriangle size={12} /> Limitations
              </span>
              <ul className="ml-5 space-y-0.5">
                {evidence.limitations.map((l, i) => (
                  <li key={i} className="text-amber-600">{l}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Raw Values (Analyst + Compliance always, others on expand) */}
          {showRich && evidence.rawValues.length > 0 && (
            <div className="flex flex-col gap-1 pt-1">
              <span className="font-semibold text-slate-700">Raw Values</span>
              <div className="ml-5 grid grid-cols-2 gap-1">
                {evidence.rawValues.map((v, i) => (
                  <span key={i} className="font-mono text-slate-500">
                    {v.label}: <strong className="text-slate-700">{v.value.toLocaleString()}</strong>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
