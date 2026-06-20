'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, Building2, Key, Users, Activity,
  ArrowLeft, Zap, Shield, ShieldCheck,
} from 'lucide-react';

const NAV = [
  { href: '/admin',               label: 'Overview',        icon: LayoutDashboard, exact: true  },
  { href: '/admin/organizations', label: 'Organizations',   icon: Building2,       exact: false },
  { href: '/admin/access',        label: 'Access Control',  icon: ShieldCheck,     exact: false },
  { href: '/admin/invites',       label: 'Invite Codes',    icon: Key,             exact: false },
  { href: '/admin/users',         label: 'Users',           icon: Users,           exact: false },
  { href: '/admin/system',        label: 'System',          icon: Activity,        exact: false },
];

interface AdminNavProps {
  userEmail: string;
}

export function AdminNav({ userEmail }: AdminNavProps) {
  const pathname = usePathname();

  return (
    <aside style={{
      width: '220px',
      flexShrink: 0,
      background: '#040a12',
      borderRight: '1px solid rgba(255,255,255,0.06)',
      display: 'flex',
      flexDirection: 'column',
      minHeight: '100vh',
      position: 'sticky',
      top: 0,
    }}>
      {/* Logo + Admin badge */}
      <div style={{ padding: '24px 20px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
          <div style={{
            width: '30px', height: '30px',
            background: 'linear-gradient(135deg, #0d9488, #0f766e)',
            borderRadius: '8px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 12px rgba(13,148,136,0.4)',
          }}>
            <Zap size={15} color="white" strokeWidth={2.5} />
          </div>
          <span style={{ fontSize: '16px', fontWeight: 800, color: '#fff', letterSpacing: '-0.01em' }}>
            Fundir
          </span>
        </div>
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '5px',
          background: 'rgba(239,68,68,0.1)',
          border: '1px solid rgba(239,68,68,0.25)',
          borderRadius: '5px',
          padding: '3px 8px',
        }}>
          <Shield size={10} color="#f87171" />
          <span style={{ fontSize: '10px', fontWeight: 700, color: '#f87171', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Admin Console
          </span>
        </div>
      </div>

      {/* Nav links */}
      <nav style={{ flex: 1, padding: '12px 10px' }}>
        {NAV.map(({ href, label, icon: Icon, exact }) => {
          const active = exact ? pathname === href : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '9px 12px',
                borderRadius: '7px',
                marginBottom: '2px',
                textDecoration: 'none',
                background: active ? 'rgba(13,148,136,0.12)' : 'transparent',
                border: active ? '1px solid rgba(13,148,136,0.2)' : '1px solid transparent',
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => {
                if (!active) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)';
              }}
              onMouseLeave={e => {
                if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent';
              }}
            >
              <Icon
                size={15}
                color={active ? '#0d9488' : '#64748b'}
                strokeWidth={active ? 2.5 : 2}
              />
              <span style={{
                fontSize: '13px',
                fontWeight: active ? 600 : 400,
                color: active ? '#e2e8f0' : '#64748b',
              }}>
                {label}
              </span>
              {active && (
                <div style={{
                  marginLeft: 'auto',
                  width: '5px', height: '5px',
                  borderRadius: '50%',
                  background: '#0d9488',
                }} />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div style={{ padding: '16px 20px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <Link
          href="/dashboard"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '7px',
            fontSize: '12px',
            color: '#475569',
            textDecoration: 'none',
            marginBottom: '14px',
            transition: 'color 0.15s',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#94a3b8'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#475569'; }}
        >
          <ArrowLeft size={12} />
          Back to App
        </Link>
        <div style={{
          padding: '10px 12px',
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: '8px',
        }}>
          <p style={{ fontSize: '11px', fontWeight: 600, color: '#e2e8f0', margin: 0, lineHeight: 1.3 }}>
            {userEmail.split('@')[0].replace('.', ' ').replace(/\b\w/g, l => l.toUpperCase())}
          </p>
          <p style={{ fontSize: '10px', color: '#475569', margin: '2px 0 0', wordBreak: 'break-all' }}>
            {userEmail}
          </p>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '4px', marginTop: '6px',
          }}>
            <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#22c55e' }} />
            <span style={{ fontSize: '10px', color: '#22c55e', fontWeight: 600 }}>Owner</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
