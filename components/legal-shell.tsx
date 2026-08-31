import Link from 'next/link';
import type { ReactNode } from 'react';

const SERIF = "'Instrument Serif',Palatino,Georgia,serif";
const INK = '#1A1F1D';
const MUTE = '#5E6D67';
const FAINT = '#8B968F';
const RULE = '#E2E6E4';
const ACCENT = '#0C6B5A';
const PAPER = '#F7F8F7';

/**
 * Shared, self-contained shell for the public legal pages (privacy, terms).
 * Inline styles + explicit light palette so these render identically regardless
 * of the app's saved theme, and without depending on the authenticated shell.
 */
export function LegalShell({
  title, updated, children,
}: { title: string; updated: string; children: ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: PAPER, color: INK, fontFamily: 'var(--font-geist-sans),-apple-system,BlinkMacSystemFont,sans-serif' }}>
      {/* Load Instrument Serif for the wordmark + heading, matching the app. */}
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Instrument+Serif&display=swap" />

      <div style={{ maxWidth: 720, margin: '0 auto', padding: '0 24px' }}>
        {/* header */}
        <header style={{ paddingTop: 44, paddingBottom: 30, borderBottom: `1px solid ${RULE}`, marginBottom: 38 }}>
          <Link href="/" style={{ fontSize: 12, letterSpacing: '.18em', textTransform: 'uppercase', color: ACCENT, textDecoration: 'none', fontWeight: 600 }}>
            Fundir.ai
          </Link>
          <h1 style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 'clamp(2rem,5vw,2.9rem)', letterSpacing: '-0.02em', margin: '18px 0 10px', lineHeight: 1.1 }}>
            {title}
          </h1>
          <p style={{ fontSize: 13, color: FAINT, margin: 0 }}>Last updated {updated}</p>
        </header>

        {/* body */}
        <div style={{ fontSize: 15.5, lineHeight: 1.72, color: '#33403A', paddingBottom: 12 }}>
          {children}
        </div>

        {/* footer */}
        <footer style={{ marginTop: 44, paddingTop: 22, paddingBottom: 56, borderTop: `1px solid ${RULE}`, display: 'flex', gap: 22, flexWrap: 'wrap', fontSize: 13.5 }}>
          <Link href="/privacy" style={{ color: MUTE, textDecoration: 'none' }}>Privacy Policy</Link>
          <Link href="/terms" style={{ color: MUTE, textDecoration: 'none' }}>Terms of Service</Link>
          <Link href="/" style={{ color: MUTE, textDecoration: 'none' }}>Home</Link>
          <span style={{ marginLeft: 'auto', color: FAINT }}>
            <a href="mailto:nickderbis@gmail.com" style={{ color: MUTE, textDecoration: 'none' }}>nickderbis@gmail.com</a>
          </span>
        </footer>
      </div>
    </div>
  );
}

// Shared inline building blocks so the two pages stay visually consistent.
export const H2 = (props: { children: ReactNode }) => (
  <h2 style={{ fontSize: 13, fontWeight: 600, letterSpacing: '.02em', textTransform: 'uppercase', color: ACCENT, margin: '38px 0 12px' }}>{props.children}</h2>
);
export const P = (props: { children: ReactNode }) => (
  <p style={{ margin: '0 0 14px' }}>{props.children}</p>
);
export const UL = (props: { children: ReactNode }) => (
  <ul style={{ margin: '0 0 14px', paddingLeft: 22, display: 'flex', flexDirection: 'column', gap: 7 }}>{props.children}</ul>
);
export const Note = (props: { children: ReactNode }) => (
  <div style={{ margin: '18px 0', padding: '14px 16px', background: '#EEF3F1', border: '1px solid #DCE6E2', borderRadius: 8, fontSize: 14, lineHeight: 1.6, color: '#33403A' }}>{props.children}</div>
);
