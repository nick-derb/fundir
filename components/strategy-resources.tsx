'use client';

// Grant strategy resources — the guides and intake forms CYC's development team
// wrote, gathered in one place instead of scattered across drives and inboxes.
// Everything opens inside Fundir: the PDF in a viewer, the two forms embedded,
// so nobody is bounced out to a link they then have to find again.

import { useEffect, useState } from 'react';
import { FileText, ClipboardCheck, ClipboardList, X, ExternalLink, Download, Maximize2 } from 'lucide-react';

type Kind = 'pdf' | 'form';
interface Resource {
  id: string; title: string; blurb: string; kind: Kind; icon: typeof FileText;
  /** What gets embedded in the viewer. */
  embed: string;
  /** The canonical link, offered as a fallback if an embed is ever blocked. */
  href: string;
  action: string;
}

const RESOURCES: Resource[] = [
  {
    id: 'ten-questions', kind: 'pdf', icon: FileText,
    title: '10 Questions to Help You Develop a Grant Proposal',
    blurb: 'The questions to answer before writing, so a proposal starts from the program rather than the deadline.',
    embed: '/resources/10-questions-grant-proposal.pdf#view=FitH',
    href: '/resources/10-questions-grant-proposal.pdf',
    action: 'Read',
  },
  {
    id: 'self-audit', kind: 'form', icon: ClipboardCheck,
    title: 'CYC Project Model Self-Audit',
    blurb: 'Walk a program through its model — need, activities, outcomes — and find the gaps a funder would ask about.',
    embed: 'https://tally.so/embed/zxR4PE?alignLeft=1&hideTitle=1&dynamicHeight=1',
    href: 'https://tally.so/r/zxR4PE',
    action: 'Start the audit',
  },
  {
    id: 'readiness', kind: 'form', icon: ClipboardList,
    title: 'CYC Grant Readiness Form',
    blurb: 'Check whether a program is ready to be funded before committing the team to an application.',
    embed: 'https://forms.cloud.microsoft/pages/responsepage.aspx?id=QzSkT9-gc0a6P2Qo8tsXcll1DjLhRs1Mi2uBzRHUmjdUM0kwSDdVOTNQMEtKRVAxWkZVQlVUOTBZQS4u&route=shorturl&embed=true',
    href: 'https://forms.cloud.microsoft/pages/responsepage.aspx?id=QzSkT9-gc0a6P2Qo8tsXcll1DjLhRs1Mi2uBzRHUmjdUM0kwSDdVOTNQMEtKRVAxWkZVQlVUOTBZQS4u&route=shorturl',
    action: 'Open the form',
  },
];

export function StrategyResources() {
  const [open, setOpen] = useState<Resource | null>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(null); };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [open]);

  return (
    <div className="bg-surface border border-hairline rounded-[14px] overflow-hidden">
      <div className="flex items-center gap-2.5 px-[18px] py-3.5 border-b border-hairline">
        <FileText className="w-[14px] h-[14px] text-accent flex-none" />
        <span className="fd-eyebrow text-secondary">Grant strategy resources</span>
        <span className="flex-1" />
        <span className="font-mono text-[10px] text-tertiary">{RESOURCES.length} · opens in Fundir</span>
      </div>
      <div className="px-[18px] py-4">
        <p className="text-[12.5px] leading-relaxed text-secondary mb-3.5">The guides and intake forms the development team wrote. Everything opens here rather than in another tab, so they stay one click from the work.</p>
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))' }}>
          {RESOURCES.map(r => (
            <button key={r.id} type="button" onClick={() => setOpen(r)}
              className="text-left bg-page border border-hairline rounded-[12px] p-[14px_15px] transition-colors hover:border-strong">
              <span className="w-[30px] h-[30px] rounded-[7px] flex items-center justify-center mb-3.5" style={{ background: 'var(--accent-tint)' }}>
                <r.icon className="w-[15px] h-[15px] text-accent" />
              </span>
              <b className="block text-[13px] font-medium tracking-[-.005em] mb-1.5 text-primary leading-snug">{r.title}</b>
              <span className="block text-[11.5px] leading-relaxed text-secondary mb-3">{r.blurb}</span>
              <span className="font-mono text-[10px] uppercase tracking-[.08em] text-accent">{r.action} →</span>
            </button>
          ))}
        </div>
      </div>

      {open && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 sm:p-6" role="dialog" aria-modal="true" aria-label={open.title}>
          <button aria-label="Close" onClick={() => setOpen(null)} className="absolute inset-0 bg-black/45 backdrop-blur-[2px] border-0 cursor-default" />
          <div className="relative flex flex-col w-full max-w-[880px] h-[min(88vh,900px)] rounded-[16px] overflow-hidden border border-hairline bg-surface" style={{ boxShadow: 'var(--shadow-overlay)', animation: 'fd-fade .22s ease' }}>
            <div className="flex items-center gap-2.5 px-4 py-3 border-b border-hairline flex-none">
              <open.icon className="w-[14px] h-[14px] text-accent flex-none" />
              <b className="text-[13px] font-medium text-primary truncate">{open.title}</b>
              <span className="flex-1" />
              {open.kind === 'pdf' && (
                <a href={open.href} download className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-hairline text-[11.5px] text-primary hover:bg-elevated no-underline"><Download className="w-3 h-3" />Download</a>
              )}
              <a href={open.href} target="_blank" rel="noopener noreferrer" title="Open in a new tab if the embed will not load" className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-hairline text-[11.5px] text-secondary hover:bg-elevated no-underline"><Maximize2 className="w-3 h-3" />New tab</a>
              <button type="button" onClick={() => setOpen(null)} aria-label="Close" className="w-8 h-8 rounded-lg flex items-center justify-center text-tertiary hover:bg-elevated"><X className="w-4 h-4" /></button>
            </div>
            <iframe
              src={open.embed}
              title={open.title}
              className="flex-1 w-full border-0 bg-page"
              // Forms need scripts and their own origin; the sandbox keeps the frame
              // from navigating Fundir itself.
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads"
            />
            <div className="flex items-center gap-2 px-4 py-2.5 border-t border-hairline flex-none">
              <span className="text-[11px] text-tertiary">
                {open.kind === 'form'
                  ? 'Responses go to the form owner, not to Fundir.'
                  : 'Stored with Fundir, so it is always here.'}
              </span>
              <span className="flex-1" />
              {open.kind === 'form' && <a href={open.href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[11px] text-accent no-underline">Trouble loading? Open directly<ExternalLink className="w-2.5 h-2.5" /></a>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
