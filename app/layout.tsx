import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Fundir — AI Grant Intelligence',
  description: 'AI-powered grant intelligence for nonprofits. Discover, score, and track federal grant opportunities.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Anti-flash: apply saved theme before first paint */}
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{var t=localStorage.getItem('fundir-theme')||'dark';document.documentElement.setAttribute('data-theme',t);}catch(e){}})();` }} />
      </head>
      <body className="antialiased" style={{ background: 'var(--page-bg)', color: 'var(--text)' }}>
        {children}
      </body>
    </html>
  );
}
