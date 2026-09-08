'use client';

// Editable AI matching configuration (Settings). View mode mirrors the original
// read-only rows; Edit mode turns the minimum score and the six factor weights
// into inputs with a live sum badge. Save is blocked until the weights total
// exactly 100%. Saving re-scores every stored match under the new weights, then
// router.refresh() re-renders the server components so the rest of the app
// reflects the change on the next page view.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, Check, X, Loader2, AlertTriangle } from 'lucide-react';
import {
  WEIGHT_FIELDS, WEIGHT_KEYS, weightSum,
  type MatchConfig, type MatchWeights,
} from '@/lib/match-config';

interface Props {
  initial: MatchConfig;
  /** Read-only context rows kept from the original panel. */
  exclusionsActive: boolean;
  discoverySearches: number;
}

export function MatchConfigEditor({ initial, exclusionsActive, discoverySearches }: Props) {
  const router = useRouter();
  const [saved, setSaved]     = useState<MatchConfig>(initial);
  const [draft, setDraft]     = useState<MatchConfig>(initial);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState('');
  const [notice, setNotice]   = useState('');

  const sum      = weightSum(draft.weights);
  const sumOk    = Math.abs(sum - 100) < 0.01;
  const minOk    = Number.isFinite(draft.minScore) && draft.minScore >= 0 && draft.minScore <= 100;
  const canSave  = sumOk && minOk && !saving;

  function startEdit() {
    setDraft(saved); setError(''); setNotice(''); setEditing(true);
  }
  function cancel() {
    setDraft(saved); setError(''); setEditing(false);
  }
  function setWeight(key: keyof MatchWeights, raw: string) {
    const v = raw === '' ? 0 : Number(raw);
    setDraft(d => ({ ...d, weights: { ...d.weights, [key]: Number.isFinite(v) ? v : 0 } }));
  }

  async function save() {
    setSaving(true); setError(''); setNotice('');
    try {
      const res = await fetch('/api/match-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || 'Save failed');
      setSaved(draft);
      setEditing(false);
      setNotice(`Saved · ${body.rescored ?? 0} grants re-scored`);
      router.refresh(); // re-render server components with the new config
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  const view = editing ? draft : saved;

  return (
    <div>
      {/* ── Toolbar ── */}
      <div className="px-5 py-3 border-b border-hairline flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          {editing ? (
            <span
              className={`font-mono text-[11px] font-semibold uppercase tracking-[0.08em] tabular-nums inline-flex items-center gap-1.5 ${
                sumOk ? 'text-success' : 'text-critical'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${sumOk ? 'bg-success' : 'bg-critical'}`} />
              Weights total {sum}%{sumOk ? '' : ' — must equal 100%'}
            </span>
          ) : notice ? (
            <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-success inline-flex items-center gap-1.5">
              <Check className="w-3 h-3" />
              {notice}
            </span>
          ) : (
            <span className="text-[11.5px] text-tertiary">
              Weights drive every match score · the floor hides grants below it
            </span>
          )}
        </div>

        {editing ? (
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={cancel}
              disabled={saving}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-hairline bg-surface text-[12px] font-semibold text-secondary hover:bg-elevated transition-colors disabled:opacity-50"
            >
              <X className="w-3.5 h-3.5" />
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={!canSave}
              title={sumOk ? undefined : 'Weights must sum to 100%'}
              className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-md bg-accent text-white text-[12px] font-semibold hover:bg-accent-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={startEdit}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-hairline bg-surface text-[12px] font-semibold text-primary hover:bg-elevated transition-colors flex-shrink-0"
          >
            <Pencil className="w-3.5 h-3.5" />
            Edit
          </button>
        )}
      </div>

      {error && (
        <div className="px-5 py-2.5 border-b border-hairline bg-surface flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 text-critical flex-shrink-0 mt-0.5" />
          <p className="text-[12px] text-critical">{error}</p>
        </div>
      )}

      {/* ── Rows ── */}
      <ul className="divide-y divide-hairline">
        <Row
          label="Minimum score"
          desc="Grants below this are hidden from every list"
        >
          {editing ? (
            <NumberInput
              value={draft.minScore}
              onChange={v => setDraft(d => ({ ...d, minScore: v === '' ? 0 : Number(v) }))}
              suffix="/ 100"
              invalid={!minOk}
            />
          ) : (
            <Value>{view.minScore} / 100</Value>
          )}
        </Row>

        {WEIGHT_FIELDS.map(({ key, label, desc }) => (
          <Row key={key} label={label} desc={desc}>
            {editing ? (
              <NumberInput
                value={draft.weights[key]}
                onChange={v => setWeight(key, v)}
                suffix="%"
                invalid={!sumOk}
              />
            ) : (
              <Value>{view.weights[key]}%</Value>
            )}
          </Row>
        ))}

        <Row label="Hard exclusions" desc="International, defense, foreign-aid">
          <Value>{exclusionsActive ? 'Active' : 'Off'}</Value>
        </Row>
        <Row label="Discovery searches" desc="Youth, STEM, afterschool, violence prevention…">
          <Value>{discoverySearches} targeted</Value>
        </Row>
      </ul>

      {editing && (
        <div className="px-5 py-3 border-t border-hairline bg-elevated">
          <p className="text-[11.5px] text-tertiary leading-relaxed">
            Saving re-scores every grant in your pipeline from its stored sub-scores — exact, and no
            re-analysis needed. Raising the minimum score only hides grants; lowering it brings them back.
          </p>
        </div>
      )}
    </div>
  );
}

// ── Local primitives, matching the Settings row vocabulary ──────────────────

function Row({ label, desc, children }: { label: string; desc: string; children: React.ReactNode }) {
  return (
    <li className="flex items-center justify-between gap-4 px-5 py-3 hover:bg-elevated transition-colors">
      <div className="min-w-0">
        <p className="text-[12.5px] font-medium text-primary">{label}</p>
        <p className="text-[11px] text-tertiary mt-0.5">{desc}</p>
      </div>
      <div className="flex-shrink-0">{children}</div>
    </li>
  );
}

function Value({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-[13px] font-semibold text-accent tabular-nums whitespace-nowrap">
      {children}
    </span>
  );
}

function NumberInput({
  value, onChange, suffix, invalid,
}: {
  value: number;
  onChange: (v: string) => void;
  suffix: string;
  invalid?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <input
        type="number"
        min={0}
        max={100}
        step={1}
        value={String(value)}
        onChange={e => onChange(e.target.value)}
        className={`w-[68px] h-8 px-2 text-right rounded-md border bg-surface font-mono text-[13px] font-semibold tabular-nums text-primary focus:outline-none focus:ring-2 focus:ring-accent/30 ${
          invalid ? 'border-critical' : 'border-hairline'
        }`}
      />
      <span className="font-mono text-[11px] text-tertiary whitespace-nowrap">{suffix}</span>
    </span>
  );
}
