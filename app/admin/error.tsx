'use client';

import { useEffect } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[admin] error boundary caught:', error);
  }, [error]);

  const isMissingKey = error.message?.includes('supabaseKey') || error.message?.includes('required');

  return (
    <div style={{
      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '60px 40px', minHeight: '60vh',
    }}>
      <div style={{
        maxWidth: '480px', width: '100%',
        background: 'rgba(239,68,68,0.05)',
        border: '1px solid rgba(239,68,68,0.2)',
        borderRadius: '12px',
        padding: '32px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
          <AlertCircle size={20} color="#f87171" />
          <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#f1f5f9', margin: 0 }}>
            Admin page error
          </h2>
        </div>

        {isMissingKey ? (
          <div>
            <p style={{ fontSize: '13px', color: '#94a3b8', margin: '0 0 12px', lineHeight: 1.6 }}>
              <strong style={{ color: '#f87171' }}>SUPABASE_SERVICE_ROLE_KEY</strong> is missing or
              invalid in the Vercel environment. Admin pages require the service role key to query
              the database with elevated permissions.
            </p>
            <ol style={{ fontSize: '12px', color: '#64748b', margin: '0 0 20px', paddingLeft: '18px', lineHeight: 1.8 }}>
              <li>Go to Vercel → Project → Settings → Environment Variables</li>
              <li>Confirm <code style={{ color: '#94a3b8' }}>SUPABASE_SERVICE_ROLE_KEY</code> has a non-empty value</li>
              <li>Redeploy: Deployments → ⋯ → Redeploy</li>
            </ol>
          </div>
        ) : (
          <p style={{ fontSize: '13px', color: '#94a3b8', margin: '0 0 20px', lineHeight: 1.6 }}>
            {error.message ?? 'An unexpected error occurred.'}
          </p>
        )}

        <button
          onClick={reset}
          style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '8px 18px',
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: '7px',
            fontSize: '13px', fontWeight: 500, color: '#e2e8f0',
            cursor: 'pointer',
          }}
        >
          <RefreshCw size={13} />
          Try again
        </button>
      </div>
    </div>
  );
}
