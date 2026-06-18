'use client';

import { useState, useTransition, useRef, useEffect } from 'react';
import { Check, ChevronDown, Loader2, CircleDot, Eye, CheckCircle2, Archive } from 'lucide-react';
import { setDraftStatus, type DraftStatus } from '@/actions/drafts';

const STATUS_META: Record<DraftStatus, { label: string; icon: typeof CircleDot; cls: string; ring: string }> = {
  drafting:  { label: 'Drafting',  icon: CircleDot,     cls: 'bg-action-soft text-action',                 ring: 'ring-action/30' },
  review:    { label: 'In review', icon: Eye,           cls: 'bg-signal-maybe-soft text-signal-maybe',     ring: 'ring-signal-maybe/30' },
  final:     { label: 'Final',     icon: CheckCircle2,  cls: 'bg-signal-pursue-soft text-signal-pursue',   ring: 'ring-signal-pursue/30' },
  discarded: { label: 'Discarded', icon: Archive,       cls: 'bg-canvas-2 text-ink-2',                     ring: 'ring-ink-2/20' },
};

const ALL_STATUSES: DraftStatus[] = ['drafting', 'review', 'final', 'discarded'];

interface Props {
  draftId:  string;
  grantId:  string;
  status:   DraftStatus;
}

export function DraftStatusControl({ draftId, grantId, status: initial }: Props) {
  const [status, setStatus]   = useState<DraftStatus>(initial);
  const [open, setOpen]       = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [pending, startT]     = useTransition();
  const rootRef               = useRef<HTMLDivElement>(null);

  // Close on outside click. Keyboard `Esc` closes too — useful since the
  // pill is a focusable control.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const current = STATUS_META[status];
  const Icon    = current.icon;

  const choose = (next: DraftStatus) => {
    if (next === status || pending) { setOpen(false); return; }
    const prev = status;
    setStatus(next);          // optimistic — flip immediately
    setOpen(false);
    setError(null);
    startT(async () => {
      const res = await setDraftStatus(draftId, next, grantId);
      if (!res.success) {
        setStatus(prev);      // rollback
        setError(res.error ?? 'Could not update status');
      }
    });
  };

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        disabled={pending}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-sm text-caption font-semibold ring-1 transition-colors ${current.cls} ${current.ring} hover:brightness-95 disabled:opacity-60`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Draft status: ${current.label}. Click to change.`}
      >
        {pending
          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
          : <Icon className="w-3.5 h-3.5" />}
        <span>{current.label}</span>
        <ChevronDown className="w-3 h-3 opacity-60" />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Set draft status"
          className="absolute left-0 mt-1.5 z-20 w-44 bg-canvas-1 rounded-md shadow-lift py-1"
        >
          {ALL_STATUSES.map(s => {
            const meta = STATUS_META[s];
            const SIcon = meta.icon;
            const isCurrent = s === status;
            return (
              <button
                key={s}
                type="button"
                role="option"
                aria-selected={isCurrent}
                onClick={() => choose(s)}
                className={`w-full flex items-center gap-2 px-3 py-1.5 text-body text-left transition-colors hover:bg-canvas-2 ${isCurrent ? 'text-ink-0' : 'text-ink-1'}`}
              >
                <SIcon className={`w-3.5 h-3.5 ${isCurrent ? 'opacity-100' : 'opacity-60'}`} />
                <span className="flex-1">{meta.label}</span>
                {isCurrent && <Check className="w-3.5 h-3.5 text-action" />}
              </button>
            );
          })}
        </div>
      )}

      {error && (
        <p className="absolute left-0 top-full mt-1 text-caption text-alert" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
