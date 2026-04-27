'use client';

import { useState } from 'react';
import { CheckCircle, XCircle, ExternalLink, Loader2 } from 'lucide-react';

interface IntegrationStatus {
  google:    { connected: boolean; email?: string | null };
  microsoft: { connected: boolean; email?: string | null };
}

interface IntegrationConnectorProps {
  orgCode: string;
  status:  IntegrationStatus;
}

// SVG icons for Google / Microsoft (inline, no extra deps)
function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  );
}

function MicrosoftIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <rect x="1"  y="1"  width="10" height="10" fill="#F25022"/>
      <rect x="13" y="1"  width="10" height="10" fill="#7FBA00"/>
      <rect x="1"  y="13" width="10" height="10" fill="#00A4EF"/>
      <rect x="13" y="13" width="10" height="10" fill="#FFB900"/>
    </svg>
  );
}

export function IntegrationConnector({
  orgCode,
  status,
}: IntegrationConnectorProps) {
  const [disconnecting, setDisconnecting] = useState<
    'google' | 'microsoft' | null
  >(null);

  async function handleDisconnect(provider: 'google' | 'microsoft') {
    setDisconnecting(provider);
    try {
      await fetch('/api/auth/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgCode, provider }),
      });
      window.location.reload();
    } catch {
      setDisconnecting(null);
    }
  }

  const services = [
    {
      provider:  'google'    as const,
      label:     'Google Workspace',
      sublabel:  'Drive · Sheets · Docs',
      Icon:      GoogleIcon,
      connectHref: `/api/auth/google?org=${orgCode}&return=/settings`,
      color:     '#4285F4',
      bg:        '#EFF6FF',
      ...status.google,
    },
    {
      provider:  'microsoft' as const,
      label:     'Microsoft 365',
      sublabel:  'OneDrive · Excel · Word',
      Icon:      MicrosoftIcon,
      connectHref: `/api/auth/microsoft?org=${orgCode}&return=/settings`,
      color:     '#0078D4',
      bg:        '#EFF6FF',
      ...status.microsoft,
    },
  ];

  return (
    <div className="divide-y divide-[#f1f5f9]">
      {services.map(
        ({ provider, label, sublabel, Icon, connectHref, connected, email }) => (
          <div
            key={provider}
            className="flex items-center justify-between px-5 py-4 hover:bg-[#f8fafc] transition-colors"
          >
            <div className="flex items-center gap-3">
              <div
                className="w-8 h-8 rounded-[6px] flex items-center justify-center flex-shrink-0"
                style={{ background: connected ? '#f0fdf4' : '#f8fafc' }}
              >
                <Icon />
              </div>
              <div>
                <p className="text-[13px] font-semibold text-[#0f172a]">{label}</p>
                <p className="text-[11px] text-[#64748b]">
                  {connected ? email ?? sublabel : sublabel}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {connected ? (
                <>
                  <div className="flex items-center gap-1.5 text-[12px] font-semibold text-[#16a34a]">
                    <CheckCircle className="w-3.5 h-3.5" />
                    Connected
                  </div>
                  <button
                    onClick={() => handleDisconnect(provider)}
                    disabled={disconnecting === provider}
                    className="text-[11px] text-[#94a3b8] hover:text-[#dc2626] transition-colors px-2 py-1 rounded hover:bg-red-50 disabled:opacity-50"
                  >
                    {disconnecting === provider ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      'Disconnect'
                    )}
                  </button>
                </>
              ) : (
                <a
                  href={connectHref}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-[7px] text-[12px] font-semibold text-white transition-all hover:opacity-90"
                  style={{ background: '#0f172a' }}
                >
                  Connect
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          </div>
        ),
      )}
    </div>
  );
}
