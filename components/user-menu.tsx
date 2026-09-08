'use client';

// Top-bar account menu — React port of the Claude Design <TopBar> account
// dropdown. The avatar shows the user's profile photo (initials as fallback),
// and the menu carries the profile / photo / calendars / notifications actions
// plus sign-out and the "signed in to" org line.
//
// "Your profile" and "Change photo" open a real editor that PATCHes
// /api/profile, so a new photo appears in the corner immediately.

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { User, Image as ImageIcon, Calendar, Bell, LogOut, Loader2, Trash2 } from 'lucide-react';

export interface UserMenuProps {
  userEmail?: string;
  userName?: string;
  userAvatar?: string | null;
  userRole?: string | null;
  orgName?: string;
  onSignOut: () => void;
}

const AVATAR_PX = 256; // client-side downscale before storing as a data URL

export function UserMenu({
  userEmail, userName, userAvatar, userRole, orgName = 'your organization', onSignOut,
}: UserMenuProps) {
  const router = useRouter();
  const [open, setOpen]       = useState(false);
  const [editing, setEditing] = useState(false);
  const [avatar, setAvatar]   = useState<string | null>(userAvatar ?? null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Profile draft
  const [display, setDisplay] = useState(userName ?? '');
  const [role, setRole]       = useState(userRole ?? '');
  const [draftAvatar, setDraftAvatar] = useState<string | null>(userAvatar ?? null);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState('');

  useEffect(() => { setAvatar(userAvatar ?? null); }, [userAvatar]);

  // The job title lives in `profiles` and isn't on the auth context, so pull it
  // (plus the freshest photo) the first time the menu is opened — no cost until
  // then, and no need to thread a prop through every page that renders AppShell.
  const [loadedRole, setLoadedRole] = useState<string | null>(userRole ?? null);
  const [fetched, setFetched] = useState(false);
  useEffect(() => {
    if (!open || fetched) return;
    setFetched(true);
    fetch('/api/profile')
      .then(r => r.json())
      .then(({ profile }) => {
        if (!profile) return;
        if (profile.role) setLoadedRole(profile.role as string);
        if (profile.avatar_url) setAvatar(profile.avatar_url as string);
        if (profile.display_name) setDisplay(profile.display_name as string);
      })
      .catch(() => { /* menu still works without it */ });
  }, [open, fetched]);

  // Close on outside click / Escape (matches the design's behavior).
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  const name = userName || (userEmail ? userEmail.split('@')[0] : 'User');
  const initials = (userName
    ? userName.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('')
    : (userEmail || 'U')[0]).toUpperCase();

  function openEditor(focusPhoto: boolean) {
    setDisplay(userName ?? '');
    setRole(loadedRole ?? userRole ?? '');
    setDraftAvatar(avatar);
    setError('');
    setOpen(false);
    setEditing(true);
    if (focusPhoto) setTimeout(() => fileRef.current?.click(), 120);
  }

  function pickPhoto(file: File) {
    setError('');
    if (!file.type.startsWith('image/')) { setError('Choose an image file.'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new window.Image();
      img.onload = () => {
        // Square-crop to the shortest edge, then downscale — keeps the stored
        // data URL small enough to live in the profiles row.
        const side = Math.min(img.width, img.height);
        const cv = document.createElement('canvas');
        cv.width = AVATAR_PX; cv.height = AVATAR_PX;
        const cx = cv.getContext('2d');
        if (!cx) return;
        cx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, AVATAR_PX, AVATAR_PX);
        setDraftAvatar(cv.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = () => setError('That image could not be read.');
      img.src = String(reader.result);
    };
    reader.onerror = () => setError('That file could not be read.');
    reader.readAsDataURL(file);
  }

  async function save() {
    setSaving(true); setError('');
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ display, role, avatar: draftAvatar }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || 'Could not save');
      setAvatar(draftAvatar);
      setEditing(false);
      router.refresh(); // re-render server components with the new profile
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  }

  const MENU = [
    { id: 'profile',  label: 'Your profile',        icon: User,      run: () => openEditor(false) },
    { id: 'photo',    label: 'Change photo',        icon: ImageIcon, run: () => openEditor(true) },
    { id: 'calendars',label: 'Connected calendars', icon: Calendar,  run: () => { setOpen(false); router.push('/settings'); } },
    { id: 'notifs',   label: 'Notifications',       icon: Bell,      run: () => { setOpen(false); router.push('/settings'); } },
  ];

  const avatarInner = (src: string | null, px: number, textSize: string) =>
    src ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt="" className="w-full h-full object-cover block" />
    ) : (
      <span className={`${textSize} font-semibold`} style={{ lineHeight: 1 }}>{initials}</span>
    );

  return (
    <>
      <div ref={wrapRef} className="relative flex-shrink-0">
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label="Account menu"
          title={userName || userEmail}
          className={`w-7 h-7 rounded-full flex items-center justify-center overflow-hidden bg-accent text-accent-on transition-shadow ${
            open ? 'ring-2 ring-accent ring-offset-1 ring-offset-surface' : 'hover:opacity-90'
          }`}
        >
          {avatarInner(avatar, 28, 'text-[11px]')}
        </button>

        {open && (
          <div
            role="menu"
            className="absolute right-0 top-[calc(100%+8px)] w-[252px] bg-surface border border-hairline rounded-xl overflow-hidden z-50"
            style={{ boxShadow: '0 16px 40px rgba(16,25,23,.14)', animation: 'fd-menu-in .16s cubic-bezier(.2,.8,.3,1)' }}
          >
            <style>{'@keyframes fd-menu-in{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}'}</style>

            {/* Identity header */}
            <div className="flex items-center gap-[11px] px-3.5 py-3 border-b border-hairline">
              <div className="w-9 h-9 rounded-full flex items-center justify-center overflow-hidden bg-accent text-accent-on flex-none">
                {avatarInner(avatar, 36, 'text-[13px]')}
              </div>
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-primary truncate">{name}</p>
                <p className="text-[11.5px] text-tertiary truncate mt-0.5">{loadedRole || userEmail}</p>
              </div>
            </div>

            {/* Actions */}
            <div className="py-[5px]">
              {MENU.map(m => (
                <button
                  key={m.id}
                  type="button"
                  role="menuitem"
                  onClick={m.run}
                  className="flex items-center gap-2.5 w-full px-3.5 py-2 text-[12.5px] text-primary text-left hover:bg-page transition-colors"
                >
                  <m.icon className="w-3.5 h-3.5 text-tertiary flex-shrink-0" />
                  <span className="flex-1">{m.label}</span>
                </button>
              ))}
            </div>

            <div className="px-3.5 py-2.5 border-t border-hairline bg-page">
              <p className="text-eyebrow text-tertiary uppercase mb-[3px]">Signed in to</p>
              <p className="text-[12px] text-secondary truncate">{orgName}</p>
            </div>

            <div className="py-[5px] border-t border-hairline">
              <button
                type="button"
                role="menuitem"
                onClick={() => { setOpen(false); onSignOut(); }}
                className="flex items-center gap-2.5 w-full px-3.5 py-2 text-[12.5px] text-secondary text-left hover:bg-page transition-colors"
              >
                <LogOut className="w-3.5 h-3.5 text-tertiary flex-shrink-0" />
                <span className="flex-1">Sign out</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Profile editor ── */}
      {editing && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-6">
          <button
            aria-label="Close"
            onClick={() => !saving && setEditing(false)}
            className="absolute inset-0 bg-black/40 backdrop-blur-[3px]"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Your profile"
            className="relative w-full max-w-[420px] bg-surface border border-hairline rounded-xl overflow-hidden"
            style={{ boxShadow: '0 24px 60px rgba(16,25,23,.20)' }}
          >
            <div className="px-5 pt-5 pb-4 border-b border-hairline">
              <h2 className="text-[17px] font-semibold text-primary">Your profile</h2>
              <p className="text-[12px] text-tertiary mt-1">Shown on your avatar and across the workspace.</p>
            </div>

            <div className="p-5 space-y-4">
              {/* Photo */}
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-full flex items-center justify-center overflow-hidden bg-accent text-accent-on flex-none border border-hairline">
                  {avatarInner(draftAvatar, 64, 'text-[20px]')}
                </div>
                <div className="flex flex-col gap-1.5 min-w-0">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-hairline bg-surface text-[12px] font-semibold text-primary hover:bg-elevated transition-colors"
                    >
                      <ImageIcon className="w-3.5 h-3.5" />
                      {draftAvatar ? 'Replace' : 'Upload'}
                    </button>
                    {draftAvatar && (
                      <button
                        type="button"
                        onClick={() => setDraftAvatar(null)}
                        className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-hairline bg-surface text-[12px] font-semibold text-secondary hover:bg-elevated transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Remove
                      </button>
                    )}
                  </div>
                  <p className="text-[11px] text-tertiary">Square crop, resized to {AVATAR_PX}px.</p>
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) pickPhoto(f); e.target.value = ''; }}
                />
              </div>

              <Field label="Display name">
                <input
                  value={display}
                  onChange={e => setDisplay(e.target.value)}
                  placeholder="How your name appears"
                  className="w-full h-9 px-2.5 rounded-md border border-hairline bg-surface text-[13px] text-primary focus:outline-none focus:ring-2 focus:ring-accent/30"
                />
              </Field>
              <Field label="Role">
                <input
                  value={role}
                  onChange={e => setRole(e.target.value)}
                  placeholder="e.g. Director of Development"
                  className="w-full h-9 px-2.5 rounded-md border border-hairline bg-surface text-[13px] text-primary focus:outline-none focus:ring-2 focus:ring-accent/30"
                />
              </Field>

              {error && <p className="text-[12px] text-critical">{error}</p>}
            </div>

            <div className="px-5 py-3.5 border-t border-hairline bg-elevated flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditing(false)}
                disabled={saving}
                className="h-9 px-3.5 rounded-md border border-hairline bg-surface text-[12.5px] font-semibold text-secondary hover:bg-page transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-accent text-white text-[12.5px] font-semibold hover:bg-accent-hover transition-colors disabled:opacity-50"
              >
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-eyebrow text-tertiary uppercase mb-1.5">{label}</span>
      {children}
    </label>
  );
}
