'use client';

import { useState, useEffect } from 'react';
import {
  Sparkles, Loader2, CheckCircle, AlertTriangle, XCircle,
  HelpCircle, ShieldAlert, Lightbulb, Info,
} from 'lucide-react';

interface RequirementCheck {
  requirement: string;
  status:      'pass' | 'caution' | 'blocker' | 'unknown';
  finding:     string;
  detail:      string;
}

interface Verdict {
  bottomLine:  string;
  topRisk:     { title: string; detail: string } | null;
  mitigations: string[];
}

interface VerdictResponse {
  requirementChecks: RequirementCheck[];
  financialScore?:   number;
  verdict:           Verdict | null;
  message?:          string;
}

const CHECK_CFG = {
  pass:    { Icon: CheckCircle,   color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0', label: 'Clears'  },
  caution: { Icon: AlertTriangle, color: '#d97706', bg: '#fffbeb', border: '#fde68a', label: 'Caution' },
  blocker: { Icon: XCircle,       color: '#dc2626', bg: '#fef2f2', border: '#fecaca', label: 'Blocker' },
  unknown: { Icon: HelpCircle,    color: '#64748b', bg: '#f8fafc', border: '#e2e8f0', label: 'Unknown' },
} as const;

export function FinancialVerdict({ grantId }: { grantId: string }) {
  const [data,    setData]    = useState<VerdictResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/financial-verdict', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ grantId }),
        });
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) setError(json.error || 'Could not load the verdict.');
        else         setData(json as VerdictResponse);
      } catch {
        if (!cancelled) setError('Network error loading the verdict.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [grantId]);

  const blockers = data?.requirementChecks.filter(c => c.status === 'blocker').length ?? 0;

  return (
    <div className="bg-white rounded-xl border border-[#e2e8f0] shadow-card overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3.5 border-b border-[#e2e8f0] bg-[#f8fafc] flex items-center gap-2">
        <div className="w-6 h-6 rounded-[5px] flex items-center justify-center"
          style={{ background: 'linear-gradient(135deg, #0d9488, #0891b2)' }}>
          <Sparkles className="w-3.5 h-3.5 text-white" />
        </div>
        <div className="flex-1">
          <h2 className="text-[13px] font-bold text-[#0f172a]">Reverse-990 Verdict</h2>
          <p className="text-[10px] text-[#94a3b8]">Your 990 tested against this grant&apos;s financial bar</p>
        </div>
        {blockers > 0 && (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#fef2f2] text-[#dc2626] border border-[#fecaca]">
            {blockers} blocker{blockers > 1 ? 's' : ''}
          </span>
        )}
      </div>

      <div className="p-5 space-y-4">
        {loading && (
          <div className="flex items-center gap-2 text-[12px] text-[#64748b] py-6 justify-center">
            <Loader2 className="w-4 h-4 animate-spin text-[#0d9488]" />
            Running reverse-990 analysis…
          </div>
        )}

        {error && !loading && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-[#fef2f2] border border-[#fecaca]">
            <XCircle className="w-4 h-4 text-[#dc2626] flex-shrink-0 mt-0.5" />
            <p className="text-[12px] text-[#991b1b]">{error}</p>
          </div>
        )}

        {data && !loading && (
          <>
            {data.message && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-[#f8fafc] border border-[#e2e8f0]">
                <Info className="w-4 h-4 text-[#64748b] flex-shrink-0 mt-0.5" />
                <p className="text-[12px] text-[#475569]">{data.message}</p>
              </div>
            )}

            {/* AI verdict */}
            {data.verdict && (
              <div className="rounded-lg border border-[#0d9488]/25 overflow-hidden">
                <div className="px-4 py-3" style={{ background: 'linear-gradient(135deg, #f0fdfa, #ecfeff)' }}>
                  <p className="text-[10px] font-bold text-[#0d9488] uppercase tracking-widest mb-1">Bottom Line</p>
                  <p className="text-[12.5px] text-[#0f172a] leading-relaxed font-medium">{data.verdict.bottomLine}</p>
                </div>

                {data.verdict.topRisk && (
                  <div className="px-4 py-3 border-t border-[#0d9488]/15 bg-white">
                    <div className="flex items-center gap-1.5 mb-1">
                      <ShieldAlert className="w-3.5 h-3.5 text-[#dc2626]" />
                      <p className="text-[11px] font-bold text-[#dc2626]">{data.verdict.topRisk.title}</p>
                    </div>
                    <p className="text-[11.5px] text-[#475569] leading-relaxed">{data.verdict.topRisk.detail}</p>
                  </div>
                )}

                {data.verdict.mitigations?.length > 0 && (
                  <div className="px-4 py-3 border-t border-[#0d9488]/15 bg-white">
                    <div className="flex items-center gap-1.5 mb-2">
                      <Lightbulb className="w-3.5 h-3.5 text-[#0d9488]" />
                      <p className="text-[11px] font-bold text-[#0f172a]">How to address it</p>
                    </div>
                    <ul className="space-y-1.5">
                      {data.verdict.mitigations.map((m, i) => (
                        <li key={i} className="flex items-start gap-2 text-[11.5px] text-[#475569] leading-relaxed">
                          <span className="text-[#0d9488] mt-[1px] flex-shrink-0">→</span>
                          <span>{m}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* Requirement checks */}
            {data.requirementChecks.length > 0 && (
              <div>
                <p className="text-[10px] font-bold text-[#94a3b8] uppercase tracking-widest mb-2">
                  Requirement Checks
                </p>
                <div className="space-y-2">
                  {data.requirementChecks.map((c, i) => {
                    const cfg = CHECK_CFG[c.status];
                    return (
                      <div key={i} className="rounded-lg border p-3" style={{ borderColor: cfg.border, background: cfg.bg }}>
                        <div className="flex items-start gap-2">
                          <cfg.Icon className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" style={{ color: cfg.color }} />
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-0.5">
                              <span className="text-[11.5px] font-bold text-[#0f172a]">{c.requirement}</span>
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                                style={{ color: cfg.color, background: '#ffffff', border: `1px solid ${cfg.border}` }}>
                                {cfg.label}
                              </span>
                            </div>
                            <p className="text-[11px] font-medium text-[#334155] mb-0.5">{c.finding}</p>
                            <p className="text-[10.5px] text-[#64748b] leading-relaxed">{c.detail}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {data.requirementChecks.length === 0 && !data.message && (
              <p className="text-[11px] text-[#94a3b8] text-center py-2">
                No grant-specific financial requirements were detected in this opportunity&apos;s text.
              </p>
            )}

            <p className="text-[10px] text-[#94a3b8] leading-relaxed pt-1 border-t border-[#f1f5f9]">
              Checks are computed from the org&apos;s IRS 990 and the grant&apos;s stated terms.
              The verdict is AI-generated — verify against the full RFP before acting.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
