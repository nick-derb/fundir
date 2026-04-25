'use client';

import { useState, useEffect, useRef, useTransition } from 'react';
import { saveNote } from '@/actions/notes';
import { FileText, CheckCircle, Loader2 } from 'lucide-react';

interface GrantNotesProps {
  grantId: string;
  initialBody: string;
  updatedAt?: string;
}

export function GrantNotes({ grantId, initialBody, updatedAt }: GrantNotesProps) {
  const [body, setBody]             = useState(initialBody);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [lastSaved, setLastSaved]   = useState(updatedAt);
  const [isPending, startTransition] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDirty = body !== initialBody;

  useEffect(() => {
    if (!isDirty) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setSaveStatus('saving');
    debounceRef.current = setTimeout(() => {
      startTransition(async () => {
        const result = await saveNote(grantId, body);
        if (result.success) {
          setSaveStatus('saved');
          setLastSaved(result.updated_at);
          setTimeout(() => setSaveStatus('idle'), 2000);
        } else {
          setSaveStatus('idle');
        }
      });
    }, 800);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [body, grantId, isDirty]);

  return (
    <div className="bg-white rounded-xl border border-[#e2e8f0] shadow-card overflow-hidden">
      <div className="px-5 py-4 border-b border-[#e2e8f0] bg-[#f8fafc] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-[#0d9488]" />
          <h2 className="text-[14px] font-semibold text-[#0f172a]">Notes</h2>
        </div>
        <div className="flex items-center gap-2">
          {saveStatus === 'saving' && (
            <span className="flex items-center gap-1.5 text-[11px] text-[#94a3b8]">
              <Loader2 className="w-3 h-3 animate-spin" /> Saving…
            </span>
          )}
          {saveStatus === 'saved' && (
            <span className="flex items-center gap-1.5 text-[11px] text-[#16a34a]">
              <CheckCircle className="w-3 h-3" /> Saved
            </span>
          )}
          {lastSaved && saveStatus === 'idle' && (
            <span className="text-[10px] text-[#94a3b8]">
              Last saved {new Date(lastSaved).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
            </span>
          )}
        </div>
      </div>
      <div className="p-5">
        <textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          placeholder="Add notes about this grant — application strategy, funder relationships, internal review feedback, next steps…"
          rows={14}
          className="w-full px-4 py-3 text-[13px] text-[#0f172a] placeholder-[#94a3b8] leading-relaxed border border-[#e2e8f0] rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-[#0d9488]/20 focus:border-[#0d9488] transition-all bg-[#fafafa] focus:bg-white"
        />
        <p className="text-[10px] text-[#94a3b8] mt-2">
          Auto-saves 0.8s after you stop typing · Markdown supported
        </p>
      </div>
    </div>
  );
}
