'use client';

/**
 * <PeerListEditor> — UI for managing an org's peer_orgs list.
 *
 * Three regions:
 *   1. Current peers (list with EIN, NTEE, basis, remove)
 *   2. Add-peer search (ProPublica live search)
 *   3. Free-form add (paste an EIN + name)
 *
 * Adding/removing a peer triggers the prospect scorer one layer up so
 * the funder-intelligence panel re-ranks immediately.
 */

import { useState, useTransition, useEffect, useRef } from 'react';
import { Plus, Trash2, Search, Loader2, AlertCircle, Save, Pencil, X } from 'lucide-react';
import {
  addPeer, removePeer, searchPeerCandidates, updatePeerBasis,
  type PeerListRow, type PeerSearchHit,
} from '@/actions/peers';

interface Props {
  initialRows: PeerListRow[];
}

export function PeerListEditor({ initialRows }: Props) {
  const [rows, setRows]               = useState<PeerListRow[]>(initialRows);
  const [error, setError]             = useState<string | null>(null);
  const [pending, startTransition]    = useTransition();

  // Sync to server-revalidated initialRows when the parent re-renders.
  useEffect(() => { setRows(initialRows); }, [initialRows]);

  const handleRemove = (peerId: string, name: string) => {
    if (!confirm(`Remove ${name} from your peer set?`)) return;
    setError(null);
    setRows(prev => prev.filter(r => r.peer_recipient_id !== peerId));
    startTransition(async () => {
      const res = await removePeer(peerId);
      if (!res.success) {
        setError(res.error ?? 'Could not remove peer');
        // Reload to recover state.
        setRows(initialRows);
      }
    });
  };

  return (
    <div className="space-y-5">
      {/* Current peers */}
      <div className="bg-canvas-1 rounded-lg shadow-flat overflow-hidden">
        <div className="px-5 py-4 border-b border-canvas-3">
          <p className="text-eyebrow font-semibold text-ink-2 uppercase tracking-wider">Your peer organizations</p>
          <p className="text-h2 font-semibold text-ink-0 mt-0.5">{rows.length} peer{rows.length === 1 ? '' : 's'}</p>
          <p className="text-caption text-ink-2 mt-0.5">
            Peer-funding overlap drives funder prospect scoring. Add orgs that look like you on
            mission, geography, and program model.
          </p>
        </div>
        {rows.length === 0 ? (
          <div className="px-5 py-8 text-center">
            <p className="text-body text-ink-2">No peers yet. Add some below to start ranking funders.</p>
          </div>
        ) : (
          <ul className="divide-y divide-canvas-3">
            {rows.map(r => (
              <PeerRow key={r.peer_recipient_id} row={r} onRemove={() => handleRemove(r.peer_recipient_id, r.name)} disabled={pending} />
            ))}
          </ul>
        )}
        {error && (
          <div className="px-5 py-2 border-t border-canvas-3 bg-signal-skip-soft text-signal-skip text-caption flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5" /> {error}
          </div>
        )}
      </div>

      {/* Search-and-add */}
      <AddPeerSearch />
    </div>
  );
}

// ── One peer row ───────────────────────────────────────────────────────────

function PeerRow({ row, onRemove, disabled }: { row: PeerListRow; onRemove: () => void; disabled: boolean }) {
  const [editing, setEditing]   = useState(false);
  const [basis, setBasis]       = useState(row.basis ?? '');
  const [similarity, setSim]    = useState(row.similarity);
  const [pending, startT]       = useTransition();
  const [savedAt, setSavedAt]   = useState<string | null>(null);

  const save = () => {
    setSavedAt(null);
    startT(async () => {
      const r = await updatePeerBasis(row.peer_recipient_id, basis, similarity);
      if (r.success) { setEditing(false); setSavedAt(new Date().toLocaleTimeString()); }
    });
  };

  return (
    <li className="px-5 py-3.5 flex items-start gap-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-body font-semibold text-ink-0 truncate">{row.name}</span>
          {row.ein && <span className="text-eyebrow text-ink-2 tabular-nums">EIN {row.ein}</span>}
          {row.ntee_code && <span className="text-eyebrow text-ink-2 uppercase tracking-wider">{row.ntee_code}</span>}
          {row.state && <span className="text-eyebrow text-ink-2">{row.city ? `${row.city}, ${row.state}` : row.state}</span>}
        </div>
        {!editing ? (
          <p className="text-caption text-ink-1 mt-1">
            <span className="text-ink-2">similarity {Math.round(row.similarity * 100)}% · basis: </span>
            {row.basis || <em className="text-ink-3">(no basis provided)</em>}
          </p>
        ) : (
          <div className="mt-2 space-y-2">
            <textarea
              value={basis}
              onChange={e => setBasis(e.target.value)}
              rows={2}
              placeholder="e.g. youth violence prevention + West Side + 501(c)(3)"
              className="w-full text-caption bg-canvas-0 text-ink-0 ring-1 ring-canvas-3 rounded-md px-3 py-2 resize-none focus:outline-none focus:ring-action"
            />
            <div className="flex items-center gap-3">
              <label className="text-caption text-ink-2 flex items-center gap-1.5">
                Similarity
                <input
                  type="number" min={0.01} max={1} step={0.01}
                  value={similarity}
                  onChange={e => setSim(Math.min(1, Math.max(0.01, Number(e.target.value))))}
                  className="w-16 bg-canvas-0 text-ink-0 ring-1 ring-canvas-3 rounded-sm px-2 py-1 text-caption tabular-nums"
                />
              </label>
              <button onClick={save} disabled={pending} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-caption font-semibold bg-action text-canvas-1 hover:bg-action-hover disabled:opacity-50">
                {pending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />} Save
              </button>
              <button onClick={() => { setEditing(false); setBasis(row.basis ?? ''); setSim(row.similarity); }} className="text-caption text-ink-2 hover:text-ink-0">
                Cancel
              </button>
              {savedAt && <span className="text-eyebrow text-signal-pursue">Saved {savedAt}</span>}
            </div>
          </div>
        )}
      </div>
      <div className="shrink-0 flex items-center gap-1">
        {!editing && (
          <button onClick={() => setEditing(true)} className="p-1 text-ink-2 hover:text-ink-0 rounded-sm" title="Edit basis">
            <Pencil className="w-3.5 h-3.5" />
          </button>
        )}
        <button onClick={onRemove} disabled={disabled} className="p-1 text-ink-2 hover:text-signal-skip rounded-sm disabled:opacity-50" title="Remove peer">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </li>
  );
}

// ── Search-and-add ─────────────────────────────────────────────────────────

function AddPeerSearch() {
  const [query, setQuery]         = useState('');
  const [stateFilter, setStateF]  = useState('IL');
  const [hits, setHits]           = useState<PeerSearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [adding, startAdd]        = useTransition();
  const [addedEin, setAddedEin]   = useState<string | null>(null);
  const debounceTimer             = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (query.trim().length < 3) { setHits([]); setSearching(false); return; }
    setSearching(true);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(async () => {
      const r = await searchPeerCandidates(query, stateFilter || undefined);
      setHits(r.hits);
      setSearching(false);
    }, 350);
    return () => { if (debounceTimer.current) clearTimeout(debounceTimer.current); };
  }, [query, stateFilter]);

  const addOne = (hit: PeerSearchHit) => {
    setError(null);
    setAddedEin(null);
    startAdd(async () => {
      const r = await addPeer({
        ein:        hit.ein,
        name:       hit.name,
        ntee_code:  hit.ntee_code,
        state:      hit.state || null,
        city:       hit.city  || null,
        similarity: 0.80,
        basis:      `Added via ProPublica search; verify mission/program match`,
      });
      if (!r.success) setError(r.error ?? 'Could not add peer');
      else { setAddedEin(hit.ein); setQuery(''); setHits([]); }
    });
  };

  return (
    <div className="bg-canvas-1 rounded-lg shadow-flat overflow-hidden">
      <div className="px-5 py-4 border-b border-canvas-3">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-6 h-6 rounded-sm bg-action-soft text-action flex items-center justify-center">
            <Plus className="w-3.5 h-3.5" />
          </div>
          <p className="text-eyebrow font-semibold text-ink-2 uppercase tracking-wider">Add a peer</p>
        </div>
        <p className="text-body text-ink-1">Search ProPublica&apos;s Nonprofit Explorer for orgs that look like you.</p>
      </div>

      <div className="px-5 py-4 space-y-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-2" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Name (or EIN). E.g. After School Matters"
              className="w-full pl-8 pr-2 py-2 text-body bg-canvas-0 text-ink-0 ring-1 ring-canvas-3 rounded-md focus:outline-none focus:ring-action"
            />
          </div>
          <select
            value={stateFilter}
            onChange={e => setStateF(e.target.value)}
            className="px-2.5 py-2 text-body bg-canvas-0 text-ink-0 ring-1 ring-canvas-3 rounded-md focus:outline-none"
            aria-label="State filter"
          >
            <option value="">All states</option>
            <option value="IL">IL</option>
            <option value="IN">IN</option>
            <option value="WI">WI</option>
            <option value="MI">MI</option>
          </select>
        </div>

        {searching && (
          <p className="text-caption text-ink-2 flex items-center gap-1.5">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Searching ProPublica…
          </p>
        )}

        {!searching && hits.length > 0 && (
          <ul className="divide-y divide-canvas-3 ring-1 ring-canvas-3 rounded-md">
            {hits.map(h => (
              <li key={h.ein} className="px-3 py-2.5 flex items-start gap-3 hover:bg-canvas-2/60">
                <div className="min-w-0 flex-1">
                  <p className="text-body font-semibold text-ink-0 truncate">{h.name}</p>
                  <p className="text-eyebrow text-ink-2">
                    EIN {h.ein} {h.ntee_code && <>· NTEE {h.ntee_code}</>} {h.city && <>· {h.city}, {h.state}</>}
                  </p>
                </div>
                <button
                  onClick={() => addOne(h)}
                  disabled={adding}
                  className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-caption font-semibold bg-action text-canvas-1 hover:bg-action-hover disabled:opacity-50"
                >
                  {adding ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />} Add
                </button>
              </li>
            ))}
          </ul>
        )}

        {!searching && query.trim().length >= 3 && hits.length === 0 && (
          <p className="text-caption text-ink-2">No matches. Try a shorter or different name.</p>
        )}

        {addedEin && (
          <p className="text-caption text-signal-pursue flex items-center gap-1.5">
            ✓ Added. Funder prospects re-scoring…
          </p>
        )}
        {error && (
          <p className="text-caption text-signal-skip flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5" /> {error}
          </p>
        )}
      </div>
    </div>
  );
}
