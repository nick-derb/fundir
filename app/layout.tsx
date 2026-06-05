import type { Metadata } from 'next';
import './globals.css';
import { RecoveryDetector } from '@/components/recovery-detector';

export const metadata: Metadata = {
  title: 'Fundir — AI Grant Intelligence',
  description: 'AI-powered grant intelligence for nonprofits. Discover, score, and track federal grant opportunities.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning — the anti-flash inline script below mutates
    // <html data-theme="..."> from localStorage before React hydrates. The
    // server renders without that attribute (no localStorage on the server),
    // so React would otherwise log a hydration mismatch every page load.
    // Suppressing the warning at the <html> level is the standard Next.js
    // pattern for theme persistence.
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Anti-flash: apply saved theme before first paint */}
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{var t=localStorage.getItem('fundir-theme')||'dark';document.documentElement.setAttribute('data-theme',t);}catch(e){}})();` }} />
      </head>
      <body className="antialiased" style={{ background: 'var(--page-bg)', color: 'var(--text)' }}>
        <RecoveryDetector />
        {children}
      </body>
    </html>
  );
}
