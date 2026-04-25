import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Fundir — AI Grant Intelligence',
  description: 'AI-powered grant intelligence for nonprofits. Discover, score, and track federal grant opportunities.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-base text-[#e2e8f0] antialiased">
        {children}
      </body>
    </html>
  );
}
