import type { Metadata } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import './globals.css';
import { RecoveryDetector } from '@/components/recovery-detector';
import { ImpersonationBanner } from '@/components/impersonation-banner';
import { getImpersonation } from '@/lib/impersonation';

export const metadata: Metadata = {
  title: 'Fundir — AI Grant Intelligence',
  description: 'AI-powered grant intelligence for nonprofits. Discover, score, and track federal grant opportunities.',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const impersonation = await getImpersonation();
  return (
    // Phase 2 redesign: LIGHT default theme (operations-console brief).
    // Geist (sans + mono) loaded via next/font, exposed as CSS variables
    // and consumed by Tailwind's `font-sans` / `font-mono`. The anti-flash
    // inline script reads the saved theme so dark-mode users don't see a
    // light flash on cold load. suppressHydrationWarning is required
    // because the script mutates <html data-theme> before React hydrates.
    <html lang="en" suppressHydrationWarning className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <head>
        {/* Beta: light only. The saved-theme read is kept in the comment so dark mode can return by
            restoring it alongside SHOW_THEME_TOGGLE in app-shell:
            var t=localStorage.getItem('fundir-theme')||'light' */}
        <script dangerouslySetInnerHTML={{ __html: `(function(){document.documentElement.setAttribute('data-theme','light');})();` }} />
        {/* Console type: Instrument Serif for titles, Inter for UI, JetBrains Mono for figures — every page. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link id="cn-fonts" rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Instrument+Serif&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" />
      </head>
      <body className="antialiased">
        <RecoveryDetector />
        {impersonation && <ImpersonationBanner name={impersonation.name} email={impersonation.email} />}
        {children}
      </body>
    </html>
  );
}
