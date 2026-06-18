'use client';

/**
 * <FunderRelationshipsEditor> — UI for org_funder_relationships.
 *
 * Existing / Prospect / Declined / Dormant relationships are member-asserted.
 * Members can:
 *   - View current relationships
 *   - Add a funder (search by name or EIN)
 *   - Flip status inline
 *   - Edit notes inline
 *   - Remove a relationship
 *
 * Writes trigger CRA + Funder-intel panel revalidation on /dashboard.
 */

import { useState, useTransition, useEffect, useRef } from 'react';
import { Plus, Trash2, Search, Loader2, AlertCircle, Save, Pencil, ChevronDown } from 'lucide-react';
import {
  listRelationships, upsertRelationship, removeRelationship, searchFunders,
  type FunderRelationshipRow, type RelationshipStatus, type FunderSearchHit,
} from '@/actions/funder-relationships';

const STATUS_META: Record<RelationshipStatus, { label: string; cls: string }> = {
  existing: { label: 'Existing', cls: 'bg-action-soft        text-action' },
  prospect: { label: 'Prospect', cls: 'bg-signal-pursue-soft text-signal-pursue' },
  declined: { label: 'Declined', cls: 'bg-signal-skip-soft   text-signal-skip' },
  dormant:  { label: 'Dormant',  cls: 'bg-canvas-2           text-ink-2' },
};
const ALL_STATUSES: RelationshipStatus[] = ['existing', 'prospect', 'declined', 'dormant'];

interface Props { initialRows: FunderRelationshipRow[]; }

export function FunderRelationshipsEditor({ initialRows }: Props) {
  const [rows, setRows]   = useState<FunderRelationshipRow[]>(initialRows);
  const [error, setError] = useState<string | null>(null);
  const [pending, startT] = useTransition();

  useEffect(() => { setRows(initialRows); }, [initialRows]);

  const removeOne = (funder_id: string, name: string) => {
    if (!confirm(`Remove relationship with ${name}?`)) return;
    setError(null);
    const prev = rows;
    setRows(rows.filter(r => r.funder_id !== funder_id));
    startT(async () => {
      const r = await removeRelationship(funder_id);
      if (!r.success) { setRows(prev); setError(r.error ?? 'Could not remove'); }
    });
  };

  const reloadFromServer = async () => {
    const r = await listRelationships();
    setRows(r.rows);
  };

  return (
    <div className="space-y-5">
      <div className="bg-canvas-1 rounded-lg shadow-flat overflow-hidden">
        <div className="px-5 py-4 border-b border-canvas-3">
          <p className="text-eyebrow font-semibold text-ink-2 uppercase tracking-wider">Your funder relationships</p>
          <p className="text-h2 font-semibold text-ink-0 mt-0.5">{rows.length} on record</p>
          <p className="text-caption text-ink-2 mt-0.5">
            Existing relationships render as Deepen on the CRA panel; Prospect + peer-signal as Open; Declined hidden; Dormant flagged for re-engagement.
          </p>
        </div>

        {rows.length === 0 ? (
          <div className="px-5 py-8 text-center">
            <p className="text-body text-ink-2">No relationships on record. Add some below.</p>
          </div>
        ) : (
          <ul className="divide-y divide-canvas-3">
            {rows.map(r => (
              <RelationshipRow key={r.funder_id} row={r} onRemove={() => removeOne(r.funder_id, r.funder_name)} onUpdated={reloadFromServer} disabled={pending} />
            ))}
          </ul>
        )}
        {error && (
          <div className="px-5 py-2 border-t border-canvas-3 bg-signal-skip-soft text-signal-skip text-caption flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5" /> {error}
          </div>
        )}
      </div>

      <AddRelationshipSearch onAdded={reloadFromServer} />
    </div>
  );
}

// ── One relationship row ───────────────────────────────────────────────────

function RelationshipRow({ row, onRemove, onUpdated, disabled }: {
  row: FunderRelationshipRow;
  onRemove: () => void;
  onUpdated: () => Promise<void>;
  disabled: boolean;
}) {
  const [status, setStatus]   = useState<RelationshipStatus>(row.status);
  const [notes, setNotes]     = useState(row.notes ?? '');
  const [editing, setEditing] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [pending, startT]     = useTransition();
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const statusRef             = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!statusOpen) return;
    const onDown = (e: MouseEvent) => { if (!statusRef.current?.contains(e.target as Node)) setStatusOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [statusOpen]);

  const chooseStatus = (s: RelationshipStatus) => {
    setStatusOpen(false);
    if (s === status) return;
    const prev = status;
    setStatus(s);
    startT(async () => {
      const r = await upsertRelationship({ funder_id: row.funder_id, status: s, notes: row.notes ?? undefined, source: 'self_reported' });
      if (!r.success) setStatus(prev);
      else await onUpdated();
    });
  };

  const saveNotes = () => {
    setSavedAt(null);
    startT(async () => {
      const r = await upsertRelationship({ funder_id: row.funder_id, status, notes });
      if (r.success) { setEditing(false); setSavedAt(new Date().toLocaleTimeString()); await onUpdated(); }
    });
  };

  const meta = STATUS_META[status];

  return (
    <li className="px-5 py-3.5 flex items-start gap-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-body font-semibold text-ink-0 truncate">{row.funder_name}</span>
          {row.ein && <span className="text-eyebrow text-ink-2 tabular-nums">EIN {row.ein}</span>}
        </div>

        {!editing ? (
          <p className="text-caption text-ink-1 mt-1 italic">
            {notes || <em className="text-ink-3 not-italic">(no notes)</em>}
          </p>
        ) : (
          <div className="mt-2 space-y-2">
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              placeholder="Internal note about this relationship"
              className="w-full text-caption bg-canvas-0 text-ink-0 ring-1 ring-canvas-3 rounded-md px-3 py-2 resize-none focus:outline-none focus:ring-action"
            />
            <div className="flex items-center gap-2">
              <button onClick={saveNotes} disabled={pending} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-caption font-semibold bg-action text-canvas-1 hover:bg-action-hover disabled:opacity-50">
                {pending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />} Save
              </button>
              <button onClick={() => { setEditing(false); setNotes(row.notes ?? ''); }} className="text-caption text-ink-2 hover:text-ink-0">
                Cancel
              </button>
              {savedAt && <span className="text-eyebrow text-signal-pursue">Saved {savedAt}</span>}
            </div>
          </div>
        )}
      </div>

      <div className="shrink-0 flex items-center gap-2" ref={statusRef}>
        <div className="relative">
          <button
            type="button"
            onClick={() => setStatusOpen(o => !o)}
            disabled={pending || disabled}
            className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-sm text-eyebrow font-semibold uppercase tracking-wider transition-colors ${meta.cls} hover:brightness-95 disabled:opacity-60`}
          >
            {pending ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
            {meta.label}
            <ChevronDown className="w-3 h-3" />
          </button>
          {statusOpen && (
            <div role="listbox" className="absolute right-0 mt-1.5 z-20 w-36 bg-canvas-1 rounded-md shadow-lift py-1">
              {ALL_STATUSES.map(s => (
                <button key={s} type="button" onClick={() => chooseStatus(s)}
                  className={`w-full flex items-center gap-2 px-3 py-1.5 text-caption text-left transition-colors hover:bg-canvas-2 ${s === status ? 'text-ink-0' : 'text-ink-1'}`}>
                  {STATUS_META[s].label}
                </button>
              ))}
            </div>
          )}
        </div>
        {!editing && (
          <button onClick={() => setEditing(true)} className="p-1 text-ink-2 hover:text-ink-0 rounded-sm" title="Edit notes">
            <Pencil className="w-3.5 h-3.5" />
          </button>
        )}
        <button onClick={onRemove} disabled={disabled} className="p-1 text-ink-2 hover:text-signal-skip rounded-sm disabled:opacity-50" title="Remove relationship">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </li>
  );
}

// ── Search-and-add ─────────────────────────────────────────────────────────

function AddRelationshipSearch({ onAdded }: { onAdded: () => Promise<void> }) {
  const [query, setQuery]       = useState('');
  const [hits, setHits]         = useState<FunderSearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [adding, startT]        = useTransition();
  const timer                   = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (query.trim().length < 2) { setHits([]); setSearching(false); return; }
    setSearching(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const r = await searchFunders(query);
      setHits(r.hits); setSearching(false);
    }, 300);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [query]);

  const addOne = (hit: FunderSearchHit) => {
    setError(null);
    startT(async () => {
      const r = await upsertRelationship({ funder_id: hit.funder_id, status: 'prospect', source: 'self_reported' });
      if (!r.success) setError(r.error ?? 'Could not add');
      else { setQuery(''); setHits([]); await onAdded(); }
    });
  };

  return (
    <div className="bg-canvas-1 rounded-lg shadow-flat overflow-hidden">
      <div className="px-5 py-4 border-b border-canvas-3">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-6 h-6 rounded-sm bg-action-soft text-action flex items-center justify-center">
            <Plus className="w-3.5 h-3.5" />
          </div>
          <p className="text-eyebrow font-semibold text-ink-2 uppercase tracking-wider">Add a relationship</p>
        </div>
        <p className="text-body text-ink-1">Search funders already in your graph; defaults to &lsquo;Prospect&rsquo; — flip status after adding.</p>
      </div>
      <div className="px-5 py-4 space-y-3">
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-2" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Funder name or EIN"
            className="w-full pl-8 pr-2 py-2 text-body bg-canvas-0 text-ink-0 ring-1 ring-canvas-3 rounded-md focus:outline-none focus:ring-action"
          />
        </div>

        {searching && <p className="text-caption text-ink-2 flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Searching…</p>}

        {!searching && hits.length > 0 && (
          <ul className="divide-y divide-canvas-3 ring-1 ring-canvas-3 rounded-md">
            {hits.map(h => (
              <li key={h.funder_id} className="px-3 py-2.5 flex items-start gap-3 hover:bg-canvas-2/60">
                <div className="min-w-0 flex-1">
                  <p className="text-body font-semibold text-ink-0 truncate">{h.name}</p>
                  <p className="text-eyebrow text-ink-2">
                    {h.ein && <>EIN {h.ein} · </>}{h.funder_type}{h.city && <> · {h.city}, {h.state}</>}
                  </p>
                </div>
                <button onClick={() => addOne(h)} disabled={adding}
                  className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-caption font-semibold bg-action text-canvas-1 hover:bg-action-hover disabled:opacity-50">
                  {adding ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />} Add
                </button>
              </li>
            ))}
          </ul>
        )}

        {!searching && query.trim().length >= 2 && hits.length === 0 && (
          <p className="text-caption text-ink-2">No matches in your funders graph. To add a brand-new funder, run the foundation ingest first.</p>
        )}

        {error && <p className="text-caption text-signal-skip flex items-center gap-1.5"><AlertCircle className="w-3.5 h-3.5" /> {error}</p>}
      </div>
    </div>
  );
}
