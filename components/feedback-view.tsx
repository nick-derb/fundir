'use client';

// Beta feedback. Two things a CYC user actually needs to say — "something's
// wrong" and "this data is out of date" — plus room for an idea. Data
// requests name the record and the correct value, so a correction lands with
// provenance ("CYC staff, date") rather than as a silent edit. Admins see the
// queue, triage it, and can copy any item as a one-line prompt.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Bug, Database, Lightbulb, Send, Check, Copy, Loader2, Paperclip, X, Download } from 'lucide-react';
import { getSupabaseClient } from '@/lib/supabase';

interface Attachment { name: string; path: string; size: number; type: string | null }
const fmtSize = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`);

const SERIF = "'Instrument Serif',Palatino,Georgia,serif";
const MONO = "'JetBrains Mono',ui-monospace,monospace";
const AMBER = '#9C7A2A', SLATE = '#5B7383', INFO = '#3E6CA8';

type Kind = 'bug' | 'data' | 'idea';
interface Item { id: string; kind: Kind; page: string | null; title: string; details: string | null; expected: string | null; record_ref: { entity?: string; name?: string; field?: string; current?: string; proposed?: string; source?: string } | null; attachments: Attachment[] | null; status: string; admin_note: string | null; user_email: string | null; user_name: string | null; created_at: string; updated_at: string }

const KINDS: Array<{ key: Kind; label: string; blurb: string; icon: typeof Bug; tone: string }> = [
  { key: 'bug', label: 'Something is wrong', blurb: 'A page errors, a control does nothing, a number looks off.', icon: Bug, tone: 'var(--critical)' },
  { key: 'data', label: 'Update this data', blurb: 'A person, funder, grant or relationship that is out of date or wrong.', icon: Database, tone: AMBER },
  { key: 'idea', label: 'An idea', blurb: 'Something Fundir should show or do.', icon: Lightbulb, tone: INFO },
];
const STATUS: Record<string, { label: string; tone: string }> = { new: { label: 'New', tone: SLATE }, triaged: { label: 'Triaged', tone: INFO }, in_progress: { label: 'In progress', tone: AMBER }, done: { label: 'Done', tone: 'var(--accent)' }, wont_fix: { label: "Won't fix", tone: 'var(--text-tertiary)' } };
const ENTITIES = ['person', 'organization', 'grant / funding event', 'relationship', 'lead', 'board seat', 'other'];

const CSS = `
.fb-root{font-family:'Inter',-apple-system,BlinkMacSystemFont,sans-serif;color:var(--text-primary);background:var(--bg-page)}
.fb-root .fd-eyebrow{font-size:11px;line-height:1.2;letter-spacing:.08em;font-weight:600;text-transform:uppercase}
.fb-root .fd-mono{font-family:${MONO};font-variant-numeric:tabular-nums}
.fb-root .fd-caption{font-size:12px;line-height:1.5}
.fb-input{width:100%;padding:8px 10px;border-radius:8px;border:1px solid var(--border-hairline);background:var(--bg-surface);font:inherit;font-size:13px;color:var(--text-primary);outline:none;transition:border-color .14s,box-shadow .14s}
.fb-input:focus{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-tint)}
textarea.fb-input{min-height:88px;resize:vertical;line-height:1.5}
.fb-kind{display:grid;grid-template-columns:22px 1fr;gap:10px;align-items:start;text-align:left;padding:12px 14px;border-radius:12px;border:1px solid var(--border-hairline);background:var(--bg-surface);font:inherit;cursor:pointer;color:inherit;transition:border-color .14s,background .14s}
.fb-kind:hover{border-color:var(--border-strong)}
.fb-kind[aria-pressed="true"]{border-color:var(--accent);background:var(--accent-tint)}
.fb-primary{display:inline-flex;align-items:center;gap:7px;height:36px;padding:0 16px;border-radius:10px;border:none;background:var(--accent);color:var(--accent-on);font:inherit;font-size:12.5px;font-weight:500;cursor:pointer}
.fb-primary:disabled{opacity:.55;cursor:default}
.fb-ghost{display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 10px;border-radius:8px;border:1px solid var(--border-hairline);background:var(--bg-surface);color:var(--text-primary);font:inherit;font-size:11.5px;cursor:pointer}
.fb-ghost:hover{background:var(--bg-elevated)}
.fb-select{height:28px;padding:0 24px 0 8px;border-radius:6px;border:1px solid var(--border-hairline);background:var(--bg-surface);font:inherit;font-size:11.5px;color:var(--text-primary)}
@keyframes fb-rise{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
.fb-rise{animation:fb-rise .3s cubic-bezier(.2,.8,.2,1) both}
@media (max-width:980px){.fb-cols{grid-template-columns:minmax(0,1fr)!important}}
`;

export function FeedbackView({ initialPage, isAdmin, orgName }: { initialPage: string | null; isAdmin: boolean; orgName: string }) {
  const [kind, setKind] = useState<Kind>(initialPage ? 'bug' : 'data');
  const [page, setPage] = useState(initialPage ?? '');
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [expected, setExpected] = useState('');
  const [rec, setRec] = useState({ entity: 'person', name: '', field: '', current: '', proposed: '', source: '' });
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [items, setItems] = useState<Item[] | null>(null);
  const [filter, setFilter] = useState<'open' | 'all'>('open');
  const [files, setFiles] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Browser → storage directly, with a server-minted signed upload URL (no size cap from the function layer).
  async function addFiles(list: FileList | null) {
    if (!list?.length) return;
    setError('');
    for (const f of Array.from(list).slice(0, 10 - files.length)) {
      if (f.size > 50 * 1024 * 1024) { setError(`${f.name} is over 50 MB`); continue; }
      setUploading(f.name);
      try {
        const res = await fetch('/api/feedback/upload-url', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: f.name, type: f.type, size: f.size }) });
        const b = await res.json();
        if (!res.ok) throw new Error(b.error ?? 'Could not prepare upload');
        const { error: upErr } = await getSupabaseClient().storage.from('feedback').uploadToSignedUrl(b.path, b.token, f, { contentType: f.type || 'application/octet-stream' });
        if (upErr) throw new Error(upErr.message);
        setFiles(x => [...x, { name: f.name, path: b.path, size: f.size, type: f.type || null }]);
      } catch (e) { setError(e instanceof Error ? e.message : `Could not upload ${f.name}`); }
      finally { setUploading(null); }
    }
    if (fileRef.current) fileRef.current.value = '';
  }

  const load = () => fetch('/api/feedback').then(r => r.json()).then(b => setItems(b.items ?? [])).catch(() => setItems([]));
  useEffect(() => { load(); }, []);

  const canSend = title.trim().length > 3 && (kind !== 'data' || (rec.name.trim() && rec.proposed.trim()));
  async function submit() {
    if (!canSend) return;
    setBusy(true); setError(''); setSent(null);
    try {
      const body = { kind, page: page || null, title: title.trim(), details: details.trim(), expected: kind === 'bug' ? expected.trim() : undefined, record_ref: kind === 'data' ? rec : undefined, attachments: files, client: kind === 'bug' ? { ua: navigator.userAgent, viewport: `${window.innerWidth}×${window.innerHeight}` } : undefined };
      const res = await fetch('/api/feedback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const b = await res.json();
      if (!res.ok) throw new Error(b.error ?? 'Could not send');
      setSent(kind === 'data' ? 'Thanks — the correction is queued and will be applied with your name and today\'s date as its source.' : 'Thanks — it\'s in the queue. You\'ll see its status below.');
      setTitle(''); setDetails(''); setExpected(''); setRec({ entity: 'person', name: '', field: '', current: '', proposed: '', source: '' }); setFiles([]);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not send'); }
    finally { setBusy(false); }
  }

  const visible = useMemo(() => (items ?? []).filter(i => filter === 'all' || !['done', 'wont_fix'].includes(i.status)), [items, filter]);
  const openCount = (items ?? []).filter(i => !['done', 'wont_fix'].includes(i.status)).length;

  return (
    <div className="fb-root" style={{ padding: '24px 26px 60px', minHeight: '100vh' }}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div style={{ marginBottom: 20 }}>
        <p className="fd-eyebrow" style={{ color: 'var(--text-tertiary)', margin: '0 0 9px' }}>{orgName} · Beta</p>
        <h1 style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 'clamp(1.9rem,3vw,2.5rem)', lineHeight: 1.04, letterSpacing: '-.018em', margin: 0 }}>Feedback</h1>
        <p style={{ margin: '9px 0 0', fontSize: 13.5, lineHeight: 1.6, color: 'var(--text-secondary)', maxWidth: '64ch' }}>Fundir is in beta with CYC. Tell us what is broken, what data is out of date, or what you wish it did. Every message is read by a person; data corrections are applied with your name and the date as their source, never silently.</p>
      </div>

      <div className="fb-cols" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.1fr) minmax(0,1fr)', gap: 20, alignItems: 'start' }}>
        {/* form */}
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-hairline)', borderRadius: 14, padding: '18px 20px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 8, marginBottom: 16 }}>
            {KINDS.map(k => { const Icon = k.icon; return (
              <button key={k.key} type="button" className="fb-kind" aria-pressed={kind === k.key} onClick={() => setKind(k.key)}>
                <Icon style={{ width: 16, height: 16, color: k.tone, marginTop: 1 }} />
                <span><b style={{ display: 'block', fontSize: 13, fontWeight: 500 }}>{k.label}</b><span className="fd-caption" style={{ color: 'var(--text-secondary)' }}>{k.blurb}</span></span>
              </button>
            ); })}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <label><span className="fd-eyebrow" style={{ display: 'block', color: 'var(--text-tertiary)', marginBottom: 5 }}>{kind === 'data' ? 'What needs to change, in one line' : kind === 'bug' ? 'What went wrong, in one line' : 'The idea, in one line'}</span><input className="fb-input" value={title} onChange={e => setTitle(e.target.value)} placeholder={kind === 'data' ? 'e.g. Scott Smith is no longer on the McCormick board' : kind === 'bug' ? 'e.g. Week view on the calendar shows the wrong dates' : 'e.g. Show which board member last spoke to each funder'} maxLength={200} /></label>
            {kind === 'bug' && (
              <>
                <label><span className="fd-eyebrow" style={{ display: 'block', color: 'var(--text-tertiary)', marginBottom: 5 }}>Page</span><input className="fb-input" value={page} onChange={e => setPage(e.target.value)} placeholder="/connections?tab=map" /></label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <label><span className="fd-eyebrow" style={{ display: 'block', color: 'var(--text-tertiary)', marginBottom: 5 }}>What happened</span><textarea className="fb-input" value={details} onChange={e => setDetails(e.target.value)} placeholder="Steps, what you clicked, any message you saw" /></label>
                  <label><span className="fd-eyebrow" style={{ display: 'block', color: 'var(--text-tertiary)', marginBottom: 5 }}>What you expected</span><textarea className="fb-input" value={expected} onChange={e => setExpected(e.target.value)} placeholder="What should have happened instead" /></label>
                </div>
              </>
            )}
            {kind === 'data' && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: 10 }}>
                  <label><span className="fd-eyebrow" style={{ display: 'block', color: 'var(--text-tertiary)', marginBottom: 5 }}>Record type</span><select className="fb-input" value={rec.entity} onChange={e => setRec({ ...rec, entity: e.target.value })}>{ENTITIES.map(x => <option key={x} value={x}>{x}</option>)}</select></label>
                  <label><span className="fd-eyebrow" style={{ display: 'block', color: 'var(--text-tertiary)', marginBottom: 5 }}>Record name</span><input className="fb-input" value={rec.name} onChange={e => setRec({ ...rec, name: e.target.value })} placeholder="Who or what, exactly as shown in Fundir" /></label>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                  <label><span className="fd-eyebrow" style={{ display: 'block', color: 'var(--text-tertiary)', marginBottom: 5 }}>Field</span><input className="fb-input" value={rec.field} onChange={e => setRec({ ...rec, field: e.target.value })} placeholder="e.g. board seat, title, amount" /></label>
                  <label><span className="fd-eyebrow" style={{ display: 'block', color: 'var(--text-tertiary)', marginBottom: 5 }}>Fundir shows</span><input className="fb-input" value={rec.current} onChange={e => setRec({ ...rec, current: e.target.value })} placeholder="the current value" /></label>
                  <label><span className="fd-eyebrow" style={{ display: 'block', color: 'var(--accent)', marginBottom: 5 }}>Should be</span><input className="fb-input" value={rec.proposed} onChange={e => setRec({ ...rec, proposed: e.target.value })} placeholder="the correct value" /></label>
                </div>
                <label><span className="fd-eyebrow" style={{ display: 'block', color: 'var(--text-tertiary)', marginBottom: 5 }}>How you know (a link, a filing, a conversation)</span><input className="fb-input" value={rec.source} onChange={e => setRec({ ...rec, source: e.target.value })} placeholder="Becomes the source on the corrected fact" /></label>
                <label><span className="fd-eyebrow" style={{ display: 'block', color: 'var(--text-tertiary)', marginBottom: 5 }}>Anything else</span><textarea className="fb-input" style={{ minHeight: 60 }} value={details} onChange={e => setDetails(e.target.value)} /></label>
              </>
            )}
            {kind === 'idea' && <label><span className="fd-eyebrow" style={{ display: 'block', color: 'var(--text-tertiary)', marginBottom: 5 }}>Tell us more</span><textarea className="fb-input" value={details} onChange={e => setDetails(e.target.value)} placeholder="What would it let you do that you can't today?" /></label>}
            {/* attachments: screenshots, spreadsheets, PDFs — anything worth keeping and building on later */}
            <div>
              <span className="fd-eyebrow" style={{ display: 'block', color: 'var(--text-tertiary)', marginBottom: 5 }}>Attach files <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>· screenshots, spreadsheets, PDFs · up to 50 MB each</span></span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                {files.map(f => (
                  <span key={f.path} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 8px 5px 10px', borderRadius: 8, border: '1px solid var(--border-hairline)', background: 'var(--bg-page)', fontSize: 12 }}>
                    <Paperclip style={{ width: 11, height: 11, color: 'var(--text-tertiary)' }} />{f.name}<span className="fd-mono" style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{fmtSize(f.size)}</span>
                    <button type="button" onClick={() => setFiles(x => x.filter(y => y.path !== f.path))} aria-label={`Remove ${f.name}`} style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', color: 'var(--text-tertiary)', lineHeight: 0 }}><X style={{ width: 12, height: 12 }} /></button>
                  </span>
                ))}
                <button type="button" className="fb-ghost" onClick={() => fileRef.current?.click()} disabled={!!uploading || files.length >= 10}>{uploading ? <><Loader2 className="animate-spin" style={{ width: 11, height: 11 }} />Uploading {uploading}…</> : <><Paperclip style={{ width: 11, height: 11 }} />Add file</>}</button>
                <input ref={fileRef} type="file" multiple hidden onChange={e => addFiles(e.target.files)} accept="image/*,.pdf,.csv,.xlsx,.xls,.docx,.doc,.txt,.json,.pptx" />
              </div>
            </div>
            {error && <p className="fd-caption" style={{ color: 'var(--critical)', margin: 0 }}>{error}</p>}
            {sent && <p className="fd-caption" style={{ color: 'var(--accent)', margin: 0, display: 'flex', gap: 6, alignItems: 'center' }}><Check style={{ width: 13, height: 13 }} />{sent}</p>}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button type="button" className="fb-primary" disabled={!canSend || busy || !!uploading} onClick={submit}>{busy ? <Loader2 className="animate-spin" style={{ width: 13, height: 13 }} /> : <Send style={{ width: 13, height: 13 }} />}Send</button>
              <span className="fd-caption" style={{ color: 'var(--text-tertiary)' }}>Sent as you, with the page and today&rsquo;s date.</span>
            </div>
          </div>
        </div>

        {/* queue */}
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-hairline)', borderRadius: 14, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: '1px solid var(--border-hairline)' }}>
            <span className="fd-eyebrow" style={{ color: 'var(--text-secondary)' }}>{isAdmin ? 'Queue · everyone at CYC' : 'Your messages'}</span>
            <span className="fd-mono" style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{openCount} open</span>
            <span style={{ flex: 1 }} />
            <select className="fb-select" value={filter} onChange={e => setFilter(e.target.value as typeof filter)}><option value="open">Open</option><option value="all">All</option></select>
          </div>
          {items === null && <p className="fd-caption" style={{ padding: 16, color: 'var(--text-tertiary)' }}>Loading…</p>}
          {items !== null && visible.length === 0 && <p className="fd-caption" style={{ padding: '28px 16px', textAlign: 'center', color: 'var(--text-tertiary)' }}>Nothing here yet.</p>}
          {visible.map((it, i) => <Row key={it.id} it={it} i={i} admin={isAdmin} onChanged={load} />)}
        </div>
      </div>
    </div>
  );
}

function promptFor(it: Item): string {
  const where = it.page ? ` on ${it.page}` : '';
  const att = it.attachments?.length ? ` Attachments (private 'feedback' bucket): ${it.attachments.map(a => a.path).join(', ')}.` : '';
  if (it.kind === 'bug') return `Bug report from ${it.user_name ?? it.user_email ?? 'a CYC user'}${where}: "${it.title}". What happened: ${it.details ?? '—'}. Expected: ${it.expected ?? '—'}.${att} Please find the cause and fix it.`;
  if (it.kind === 'data') { const r = it.record_ref ?? {}; return `Data correction from ${it.user_name ?? it.user_email ?? 'a CYC user'}: ${r.entity ?? 'record'} "${r.name ?? ''}" — field "${r.field ?? ''}" currently "${r.current ?? ''}", should be "${r.proposed ?? ''}". Source: ${r.source || `${it.user_name ?? it.user_email} (CYC staff), ${it.created_at.slice(0, 10)}`}. ${it.details ?? ''}${att} Apply it with that provenance and re-derive anything downstream.`; }
  return `Idea from ${it.user_name ?? it.user_email ?? 'a CYC user'}: "${it.title}". ${it.details ?? ''}${att} Assess and propose how it would fit the console.`;
}

function Row({ it, i, admin, onChanged }: { it: Item; i: number; admin: boolean; onChanged: () => void }) {
  const [copied, setCopied] = useState(false);
  const [note, setNote] = useState(it.admin_note ?? '');
  const k = KINDS.find(x => x.key === it.kind)!; const Icon = k.icon; const st = STATUS[it.status] ?? STATUS.new;
  async function patch(body: Record<string, unknown>) { await fetch(`/api/feedback/${it.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); onChanged(); }
  return (
    <div className="fb-rise" style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-hairline)', animationDelay: `${Math.min(300, i * 30)}ms` }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <Icon style={{ width: 14, height: 14, color: k.tone, marginTop: 2, flex: 'none' }} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <b style={{ display: 'block', fontSize: 13, fontWeight: 500 }}>{it.title}</b>
          <span className="fd-caption" style={{ color: 'var(--text-tertiary)', display: 'block', marginTop: 2 }}>{new Date(it.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}{admin && it.user_name ? ` · ${it.user_name}` : ''}{it.page ? ` · ${it.page}` : ''}</span>
          {it.kind === 'data' && it.record_ref && <span className="fd-caption" style={{ display: 'block', marginTop: 4, color: 'var(--text-secondary)' }}>{it.record_ref.entity} <b style={{ fontWeight: 500 }}>{it.record_ref.name}</b>{it.record_ref.field ? ` · ${it.record_ref.field}` : ''}: {it.record_ref.current ? <span style={{ textDecoration: 'line-through', color: 'var(--text-tertiary)' }}>{it.record_ref.current}</span> : null} <span style={{ color: 'var(--accent)' }}>{it.record_ref.proposed}</span></span>}
          {it.attachments && it.attachments.length > 0 && (
            <span style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
              {it.attachments.map(a => <a key={a.path} href={`/api/feedback/${it.id}/file?path=${encodeURIComponent(a.path)}`} className="fb-ghost" style={{ height: 24, fontSize: 11, textDecoration: 'none' }} title={`${a.name} · ${fmtSize(a.size)}`}><Download style={{ width: 10, height: 10 }} />{a.name.length > 28 ? a.name.slice(0, 26) + '…' : a.name}</a>)}
            </span>
          )}
          {it.admin_note && <span className="fd-caption" style={{ display: 'block', marginTop: 4, color: 'var(--text-secondary)', borderLeft: '2px solid var(--accent)', paddingLeft: 8 }}>{it.admin_note}</span>}
        </div>
        <span className="fd-mono" style={{ fontSize: 9, letterSpacing: '.07em', textTransform: 'uppercase', color: st.tone, border: `1px solid color-mix(in srgb, ${st.tone} 35%, transparent)`, borderRadius: 3, padding: '2px 6px', whiteSpace: 'nowrap', flex: 'none' }}>{st.label}</span>
      </div>
      {admin && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 8, paddingLeft: 24, flexWrap: 'wrap' }}>
          <select className="fb-select" value={it.status} onChange={e => patch({ status: e.target.value })} aria-label="Status">{Object.entries(STATUS).map(([k2, v]) => <option key={k2} value={k2}>{v.label}</option>)}</select>
          <input className="fb-input" style={{ flex: '1 1 160px', height: 28, padding: '0 8px', fontSize: 12 }} placeholder="Note back to the reporter…" value={note} onChange={e => setNote(e.target.value)} onBlur={() => note !== (it.admin_note ?? '') && patch({ admin_note: note })} />
          <button type="button" className="fb-ghost" onClick={async () => { await navigator.clipboard.writeText(promptFor(it)); setCopied(true); setTimeout(() => setCopied(false), 1500); }} title="Copy as a prompt for Claude">{copied ? <Check style={{ width: 11, height: 11, color: 'var(--accent)' }} /> : <Copy style={{ width: 11, height: 11 }} />}{copied ? 'Copied' : 'Copy as prompt'}</button>
        </div>
      )}
    </div>
  );
}
