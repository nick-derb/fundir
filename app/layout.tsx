import type { Metadata } from 'next';
import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
import '@fontsource/instrument-serif';
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
    // Light default theme. The three typefaces — Inter (UI), JetBrains Mono
    // (figures) and Instrument Serif (titles) — are self-hosted through
    // Fontsource and named once in globals.css as --font-sans / --font-mono /
    // --font-display, so no page loads its own copy and nothing is fetched
    // from Google at runtime. suppressHydrationWarning is required because
    // the inline script sets <html data-theme> before React hydrates.
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Beta: light only. The saved-theme read is kept in the comment so dark mode can return by
            restoring it alongside SHOW_THEME_TOGGLE in app-shell:
            var t=localStorage.getItem('fundir-theme')||'light' */}
        <script dangerouslySetInnerHTML={{ __html: `(function(){document.documentElement.setAttribute('data-theme','light');})();` }} />
      </head>
      <body className="antialiased">
        <RecoveryDetector />
        {impersonation && <ImpersonationBanner name={impersonation.name} email={impersonation.email} />}
        {children}
      </body>
    </html>
  );
}
