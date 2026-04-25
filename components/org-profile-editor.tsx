'use client';

import { useState, useTransition } from 'react';
import { saveOrgProfile, addGrantRecord, removeGrantRecord } from '@/actions/org-profile';
import type { OrgProfileData, GrantRecord } from '@/actions/org-profile';
import { formatCurrency } from '@/lib/utils';
import {
  Save, Plus, Trash2, CheckCircle, AlertCircle, Loader2,
  DollarSign, Users, Building2, Target, FileText, Award,
  Clock, TrendingUp, ChevronDown, ChevronUp,
} from 'lucide-react';

// ── Shared input styles ───────────────────────────────────────────────────────
const INPUT  = 'w-full px-3 py-2 border border-[#e2e8f0] rounded-lg text-[13px] text-[#0f172a] placeholder-[#94a3b8] bg-white focus:outline-none focus:ring-2 focus:ring-[#0d9488]/20 focus:border-[#0d9488] transition-all';
const LABEL  = 'block text-[11px] font-semibold text-[#64748b] uppercase tracking-wide mb-1.5';
const SECTION = 'bg-white rounded-xl border border-[#e2e8f0] shadow-card overflow-hidden';
const SHEADER = 'px-6 py-4 border-b border-[#e2e8f0] bg-[#f8fafc] flex items-center justify-between cursor-pointer select-none';

// ── Collapsible section wrapper ───────────────────────────────────────────────
function Section({ title, sub, icon: Icon, color, children, defaultOpen = true }: {
  title: string; sub?: string; icon: React.ElementType; color: string;
  children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={SECTION}>
      <div className={SHEADER} onClick={() => setOpen(o => !o)}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: color + '18' }}>
            <Icon className="w-4 h-4" style={{ color }} />
          </div>
          <div>
            <p className="text-[14px] font-semibold text-[#0f172a]">{title}</p>
            {sub && <p className="text-[11px] text-[#64748b]">{sub}</p>}
          </div>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-[#94a3b8]" /> : <ChevronDown className="w-4 h-4 text-[#94a3b8]" />}
      </div>
      {open && <div className="p-6">{children}</div>}
    </div>
  );
}

// ── Currency input ────────────────────────────────────────────────────────────
function CurrencyInput({ label, value, onChange, hint }: {
  label: string; value: number; onChange: (v: number) => void; hint?: string;
}) {
  return (
    <div>
      <label className={LABEL}>{label}</label>
      <div className="relative">
        <span className="absolute left-3 top-2.5 text-[13px] text-[#94a3b8]">$</span>
        <input
          type="number" min={0} step={1000}
          value={value || ''}
          onChange={e => onChange(Number(e.target.value) || 0)}
          className={INPUT + ' pl-7'}
          placeholder="0"
        />
      </div>
      {hint && <p className="text-[10px] text-[#94a3b8] mt-1">{hint}</p>}
    </div>
  );
}

// ── Percentage input ──────────────────────────────────────────────────────────
function PctInput({ label, value, onChange, color }: {
  label: string; value: number; onChange: (v: number) => void; color: string;
}) {
  return (
    <div>
      <label className={LABEL}>{label}</label>
      <div className="relative">
        <input
          type="number" min={0} max={100} step={1}
          value={value || ''}
          onChange={e => onChange(Math.min(100, Math.max(0, Number(e.target.value) || 0)))}
          className={INPUT + ' pr-8'}
          placeholder="0"
        />
        <span className="absolute right-3 top-2.5 text-[12px] font-bold" style={{ color }}>%</span>
      </div>
      <div className="mt-1.5 h-1.5 bg-[#f1f5f9] rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${value}%`, background: color }} />
      </div>
    </div>
  );
}

// ── Grant record table ────────────────────────────────────────────────────────
function GrantRecordTable({
  list, records, orgCode, showYear = true, showDate = false, showStatus = false,
}: {
  list: 'grant_history' | 'pending_grants' | 'awarded_grants';
  records: GrantRecord[];
  orgCode: string;
  showYear?: boolean;
  showDate?: boolean;
  showStatus?: boolean;
}) {
  const [adding, setAdding]     = useState(false);
  const [isPending, start]      = useTransition();
  const [funder, setFunder]     = useState('');
  const [program, setProgram]   = useState('');
  const [amount, setAmount]     = useState('');
  const [year, setYear]         = useState(String(new Date().getFullYear()));
  const [date, setDate]         = useState('');
  const [status, setStatus]     = useState('');

  function handleAdd() {
    if (!funder.trim() || !amount) return;
    start(async () => {
      await addGrantRecord(orgCode, list, {
        funder: funder.trim(),
        program: program.trim(),
        amount: Number(amount),
        ...(showYear  ? { year: Number(year) } : {}),
        ...(showDate  ? { submitted_date: date } : {}),
        ...(showStatus ? { status: status.trim() } : {}),
      });
      setFunder(''); setProgram(''); setAmount(''); setDate(''); setStatus('');
      setAdding(false);
    });
  }

  function handleRemove(id: string) {
    start(async () => { await removeGrantRecord(orgCode, list, id); });
  }

  const total = records.reduce((s, r) => s + r.amount, 0);

  return (
    <div>
      {records.length > 0 && (
        <div className="mb-3 overflow-hidden rounded-lg border border-[#e2e8f0]">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="bg-[#f8fafc] border-b border-[#e2e8f0]">
                <th className="text-left px-3 py-2 font-semibold text-[#94a3b8] uppercase tracking-wide text-[10px]">Funder</th>
                <th className="text-left px-3 py-2 font-semibold text-[#94a3b8] uppercase tracking-wide text-[10px]">Program</th>
                {showYear  && <th className="text-left px-3 py-2 font-semibold text-[#94a3b8] uppercase tracking-wide text-[10px]">Year</th>}
                {showDate  && <th className="text-left px-3 py-2 font-semibold text-[#94a3b8] uppercase tracking-wide text-[10px]">Submitted</th>}
                {showStatus && <th className="text-left px-3 py-2 font-semibold text-[#94a3b8] uppercase tracking-wide text-[10px]">Status</th>}
                <th className="text-right px-3 py-2 font-semibold text-[#94a3b8] uppercase tracking-wide text-[10px]">Amount</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {records.map(r => (
                <tr key={r.id} className="border-t border-[#f8fafc] hover:bg-[#f8fafc] transition-colors group">
                  <td className="px-3 py-2.5 font-medium text-[#0f172a]">{r.funder}</td>
                  <td className="px-3 py-2.5 text-[#64748b] max-w-[160px] truncate">{r.program || '—'}</td>
                  {showYear  && <td className="px-3 py-2.5 text-[#64748b]">{r.year || '—'}</td>}
                  {showDate  && <td className="px-3 py-2.5 text-[#64748b]">{r.submitted_date ? new Date(r.submitted_date).toLocaleDateString() : '—'}</td>}
                  {showStatus && <td className="px-3 py-2.5 text-[#64748b]">{r.status || '—'}</td>}
                  <td className="px-3 py-2.5 text-right font-semibold font-mono text-[#0d9488]">{formatCurrency(r.amount)}</td>
                  <td className="px-2">
                    <button onClick={() => handleRemove(r.id)} className="opacity-0 group-hover:opacity-100 p-1 text-[#94a3b8] hover:text-red-500 transition-all">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            {records.length > 1 && (
              <tfoot>
                <tr className="border-t border-[#e2e8f0] bg-[#f8fafc]">
                  <td colSpan={showYear || showDate ? (showStatus ? 4 : 3) : 2} className="px-3 py-2 text-[11px] font-semibold text-[#64748b]">Total ({records.length} grants)</td>
                  <td className="px-3 py-2 text-right text-[12px] font-bold text-[#0f172a] font-mono">{formatCurrency(total)}</td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      {adding ? (
        <div className="p-3 bg-[#f0fdfa] rounded-lg border border-[#99f6e4]">
          <div className="grid grid-cols-2 gap-2 mb-2">
            <input value={funder} onChange={e => setFunder(e.target.value)} placeholder="Funder name *" className={INPUT} />
            <input value={program} onChange={e => setProgram(e.target.value)} placeholder="Program / purpose" className={INPUT} />
          </div>
          <div className="grid grid-cols-3 gap-2 mb-2">
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-[12px] text-[#94a3b8]">$</span>
              <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="Amount *" className={INPUT + ' pl-6'} />
            </div>
            {showYear && <input type="number" value={year} onChange={e => setYear(e.target.value)} placeholder="Year" className={INPUT} />}
            {showDate && <input type="date" value={date} onChange={e => setDate(e.target.value)} className={INPUT} />}
            {showStatus && <input value={status} onChange={e => setStatus(e.target.value)} placeholder="Status" className={INPUT} />}
          </div>
          <div className="flex gap-2">
            <button onClick={handleAdd} disabled={!funder.trim() || !amount || isPending} className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0d9488] text-white rounded-lg text-[12px] font-semibold hover:bg-[#0f766e] disabled:opacity-40 transition-colors">
              {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} Add
            </button>
            <button onClick={() => setAdding(false)} className="px-3 py-1.5 text-[12px] text-[#64748b] hover:text-[#0f172a] transition-colors">Cancel</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setAdding(true)} className="flex items-center gap-1.5 px-3 py-1.5 border border-dashed border-[#cbd5e1] rounded-lg text-[12px] text-[#64748b] hover:border-[#0d9488] hover:text-[#0d9488] transition-all">
          <Plus className="w-3.5 h-3.5" /> Add entry
        </button>
      )}
    </div>
  );
}

// ── Tag input ─────────────────────────────────────────────────────────────────
function TagInput({ label, values, onChange, placeholder }: {
  label: string; values: string[]; onChange: (v: string[]) => void; placeholder?: string;
}) {
  const [input, setInput] = useState('');
  function add() {
    const v = input.trim();
    if (v && !values.includes(v)) onChange([...values, v]);
    setInput('');
  }
  return (
    <div>
      <label className={LABEL}>{label}</label>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {values.map(v => (
          <span key={v} className="inline-flex items-center gap-1 px-2.5 py-1 bg-[#f0fdfa] text-[#0d9488] border border-[#99f6e4] rounded-full text-[11px] font-medium">
            {v}
            <button onClick={() => onChange(values.filter(x => x !== v))} className="hover:text-red-500 transition-colors ml-0.5">×</button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          placeholder={placeholder || 'Type and press Enter'}
          className={INPUT + ' flex-1'}
        />
        <button onClick={add} className="px-3 py-2 bg-[#f8fafc] border border-[#e2e8f0] rounded-lg text-[12px] text-[#475569] hover:bg-[#f1f5f9] transition-colors">Add</button>
      </div>
    </div>
  );
}

// ── Main editor ───────────────────────────────────────────────────────────────
interface OrgProfileEditorProps {
  orgCode:   string;
  orgName:   string;
  ein:       string;
  profile:   OrgProfileData;
  updatedAt: string | null;
  updatedBy: string | null;
  userEmail: string;
  fy990:     number | null; // most recent 990 filing year
}

export function OrgProfileEditor({
  orgCode, orgName, ein, profile: initialProfile, updatedAt, updatedBy, userEmail, fy990,
}: OrgProfileEditorProps) {
  const [profile, setProfile] = useState<OrgProfileData>(initialProfile);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [saveMsg, setSaveMsg]       = useState('');
  const [isPending, startTransition] = useTransition();

  function update<K extends keyof OrgProfileData>(key: K, value: OrgProfileData[K]) {
    setProfile(p => ({ ...p, [key]: value }));
  }

  function handleSave() {
    setSaveStatus('saving');
    startTransition(async () => {
      const result = await saveOrgProfile(orgCode, profile, userEmail);
      if (result.success) {
        setSaveStatus('saved');
        setSaveMsg(result.error || 'All changes saved.'); // error here = soft warning
        setTimeout(() => setSaveStatus('idle'), 3000);
      } else {
        setSaveStatus('error');
        setSaveMsg(result.error || 'Save failed.');
      }
    });
  }

  const pctSum = profile.current_govt_revenue_pct
    + profile.current_private_grants_pct
    + profile.current_program_revenue_pct
    + profile.current_other_revenue_pct;
  const pctWarning = pctSum > 0 && Math.abs(pctSum - 100) > 5;

  return (
    <div className="space-y-4">

      {/* ── Save bar ── */}
      <div className="sticky top-12 z-30 bg-white/95 backdrop-blur border border-[#e2e8f0] rounded-xl shadow-card px-5 py-3 flex items-center justify-between">
        <div>
          <p className="text-[13px] font-semibold text-[#0f172a]">{orgName}</p>
          <p className="text-[11px] text-[#94a3b8]">
            EIN {ein.replace(/(\d{2})(\d{7})/, '$1-$2')}
            {updatedAt && ` · Last saved ${new Date(updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`}
            {updatedBy && ` by ${updatedBy}`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {saveStatus === 'saved' && (
            <span className="flex items-center gap-1.5 text-[12px] text-[#16a34a] font-medium">
              <CheckCircle className="w-3.5 h-3.5" />{saveMsg}
            </span>
          )}
          {saveStatus === 'error' && (
            <span className="flex items-center gap-1.5 text-[12px] text-red-500">
              <AlertCircle className="w-3.5 h-3.5" />{saveMsg}
            </span>
          )}
          {pctWarning && (
            <span className="text-[11px] text-amber-600 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" /> Revenue %s sum to {pctSum}%
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={isPending}
            className="flex items-center gap-2 px-4 py-2 bg-[#0d9488] text-white rounded-lg text-[13px] font-semibold hover:bg-[#0f766e] disabled:opacity-40 transition-colors"
          >
            {isPending
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving…</>
              : <><Save className="w-3.5 h-3.5" /> Save Changes</>
            }
          </button>
        </div>
      </div>

      {/* ── 990 vs Self-reported banner ── */}
      {fy990 && (
        <div className="flex items-start gap-3 px-5 py-4 bg-[#fffbeb] border border-[#fde68a] rounded-xl">
          <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-[13px] font-semibold text-[#92400e]">IRS 990 data reflects FY{fy990} — typically 12–18 months behind</p>
            <p className="text-[12px] text-amber-700 mt-0.5 leading-relaxed">
              Use this profile to enter your current-year actuals. Fundir uses both your 990 (for historical credibility signals) and this self-reported data (for current financial matching). Funders will only see what you include in grant applications — this data is for internal matching purposes only.
            </p>
          </div>
        </div>
      )}

      {/* ── Current Year Financials ── */}
      <Section title="Current Year Financials" sub="Self-reported actuals — overrides 990 lag in matching" icon={DollarSign} color="#0d9488">
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div>
            <label className={LABEL}>Fiscal Year End</label>
            <select
              value={profile.fiscal_year_end}
              onChange={e => update('fiscal_year_end', e.target.value)}
              className={INPUT}
            >
              {['December 31','September 30','June 30','March 31'].map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>
          <CurrencyInput label="Current Annual Budget" value={profile.current_annual_budget} onChange={v => update('current_annual_budget', v)} hint="Board-approved operating budget for current fiscal year" />
          <CurrencyInput label="Current Annual Revenue" value={profile.current_annual_revenue} onChange={v => update('current_annual_revenue', v)} />
          <CurrencyInput label="Current Net Assets" value={profile.current_net_assets} onChange={v => update('current_net_assets', v)} hint="Total assets minus total liabilities (current)" />
          <div>
            <label className={LABEL}>Months of Operating Reserves</label>
            <input
              type="number" min={0} max={120} step={0.1}
              value={profile.current_months_reserves || ''}
              onChange={e => update('current_months_reserves', Number(e.target.value) || 0)}
              className={INPUT}
              placeholder="e.g. 3.5"
            />
          </div>
        </div>

        <p className="text-[12px] font-semibold text-[#0f172a] mb-3">Revenue Composition <span className={`ml-2 text-[11px] font-normal ${pctWarning ? 'text-amber-600' : 'text-[#94a3b8]'}`}>({pctSum}% — should total 100%)</span></p>
        {/* Stacked bar preview */}
        {pctSum > 0 && (
          <div className="flex h-3 rounded-full overflow-hidden gap-0.5 mb-4">
            {[
              { pct: profile.current_govt_revenue_pct,    color: profile.current_govt_revenue_pct >= 50 ? '#dc2626' : '#0d9488' },
              { pct: profile.current_private_grants_pct,  color: '#2563eb' },
              { pct: profile.current_program_revenue_pct, color: '#7c3aed' },
              { pct: profile.current_other_revenue_pct,   color: '#94a3b8' },
            ].filter(s => s.pct > 0).map((s, i) => (
              <div key={i} style={{ width: `${s.pct}%`, background: s.color }} className="first:rounded-l-full last:rounded-r-full" />
            ))}
          </div>
        )}
        <div className="grid grid-cols-2 gap-4">
          <PctInput label="Government Grants %" value={profile.current_govt_revenue_pct}    onChange={v => update('current_govt_revenue_pct', v)}    color={profile.current_govt_revenue_pct >= 50 ? '#dc2626' : '#0d9488'} />
          <PctInput label="Private Grants & Gifts %" value={profile.current_private_grants_pct}  onChange={v => update('current_private_grants_pct', v)}  color="#2563eb" />
          <PctInput label="Program Service Revenue %" value={profile.current_program_revenue_pct} onChange={v => update('current_program_revenue_pct', v)} color="#7c3aed" />
          <PctInput label="Other Revenue %" value={profile.current_other_revenue_pct}   onChange={v => update('current_other_revenue_pct', v)}   color="#94a3b8" />
        </div>
      </Section>

      {/* ── Organizational Capacity ── */}
      <Section title="Organizational Capacity" sub="Staffing, programs, and service delivery metrics" icon={Users} color="#2563eb">
        <div className="grid grid-cols-3 gap-4 mb-4">
          {[
            { label: 'Full-Time Staff',  key: 'num_full_time_staff'  as const },
            { label: 'Part-Time Staff',  key: 'num_part_time_staff'  as const },
            { label: 'Volunteers',       key: 'num_volunteers'       as const },
            { label: 'Participants Served Annually', key: 'participants_served_annually' as const },
            { label: 'Program Sites',   key: 'num_program_sites'    as const },
          ].map(({ label, key }) => (
            <div key={key}>
              <label className={LABEL}>{label}</label>
              <input
                type="number" min={0}
                value={profile[key] || ''}
                onChange={e => update(key, Number(e.target.value) || 0)}
                className={INPUT}
                placeholder="0"
              />
            </div>
          ))}
        </div>
        <TagInput
          label="Accreditations & Certifications"
          values={profile.accreditations}
          onChange={v => update('accreditations', v)}
          placeholder="e.g. NAEYC, GATA, United Way Member Agency"
        />
      </Section>

      {/* ── Mission & Strategy ── */}
      <Section title="Mission & Strategy" sub="Narrative data used in grant matching and application context" icon={Target} color="#7c3aed">
        <div className="space-y-4">
          <div>
            <label className={LABEL}>Mission Statement</label>
            <textarea
              value={profile.mission_statement}
              onChange={e => update('mission_statement', e.target.value)}
              rows={4}
              className={INPUT + ' resize-none'}
              placeholder="Your organization's mission statement…"
            />
          </div>
          <div>
            <label className={LABEL}>Geographic Service Area</label>
            <input
              value={profile.geographic_service_area}
              onChange={e => update('geographic_service_area', e.target.value)}
              className={INPUT}
              placeholder="e.g. Chicago South and West sides — Cook County"
            />
          </div>
          <TagInput
            label="Strategic Priorities (Current)"
            values={profile.strategic_priorities}
            onChange={v => update('strategic_priorities', v)}
            placeholder="e.g. Workforce development expansion, Head Start capacity"
          />
          <div>
            <label className={LABEL}>Capacity & Infrastructure Notes</label>
            <textarea
              value={profile.capacity_notes}
              onChange={e => update('capacity_notes', e.target.value)}
              rows={3}
              className={INPUT + ' resize-none'}
              placeholder="Financial management systems, audit status, key infrastructure…"
            />
          </div>
          <TagInput
            label="Key Funders (Current Relationships)"
            values={profile.key_funders}
            onChange={v => update('key_funders', v)}
            placeholder="e.g. Chicago Community Trust, MacArthur Foundation"
          />
        </div>
      </Section>

      {/* ── Grant History ── */}
      <Section title="Grant History" sub="Past awards — used to compute historical win rates by funder" icon={Award} color="#16a34a" defaultOpen={false}>
        <p className="text-[12px] text-[#64748b] mb-4">
          Previous grants received. Used internally to improve match scoring — we factor in existing funder relationships and award patterns.
        </p>
        <GrantRecordTable list="grant_history" records={profile.grant_history} orgCode={orgCode} showYear />
      </Section>

      {/* ── Pending Applications ── */}
      <Section title="Pending Applications" sub="In-flight grant applications not yet in the pipeline" icon={Clock} color="#d97706" defaultOpen={false}>
        <p className="text-[12px] text-[#64748b] mb-4">
          Applications currently under review by funders. Tracking these prevents duplicate applications and helps forecast cash flow.
        </p>
        <GrantRecordTable list="pending_grants" records={profile.pending_grants} orgCode={orgCode} showYear={false} showDate showStatus />
      </Section>

      {/* ── Awarded Grants ── */}
      <Section title="Active & Recent Awards" sub="Confirmed grants currently being implemented" icon={TrendingUp} color="#0d9488" defaultOpen={false}>
        <p className="text-[12px] text-[#64748b] mb-4">
          Active awards — useful for tracking reporting obligations, period of performance, and overall portfolio health.
        </p>
        <GrantRecordTable list="awarded_grants" records={profile.awarded_grants} orgCode={orgCode} showYear />
      </Section>

      {/* ── Data policy notice ── */}
      <div className="flex items-start gap-3 px-5 py-4 bg-[#f8fafc] border border-[#e2e8f0] rounded-xl">
        <FileText className="w-4 h-4 text-[#94a3b8] mt-0.5 flex-shrink-0" />
        <div>
          <p className="text-[12px] font-semibold text-[#475569]">Data Security & Privacy</p>
          <p className="text-[11px] text-[#94a3b8] leading-relaxed mt-0.5">
            This profile is stored securely in your organization's private workspace and is never shared with funders or third parties.
            It is used exclusively to improve grant match accuracy within Fundir.
            All financial figures are self-reported and are not verified against external sources.
          </p>
        </div>
      </div>

    </div>
  );
}
