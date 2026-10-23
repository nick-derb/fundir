'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, Building2, Key, UserCheck, Activity,
  ArrowLeft, Zap, Shield, ShieldCheck, History, Brain,
} from 'lucide-react';

// Three groups: the platform itself, who can get in, and the model work.
const GROUPS = [
  { label: 'Platform', items: [
    { href: '/admin',               label: 'Overview',        icon: LayoutDashboard, exact: true  },
    { href: '/admin/organizations', label: 'Organizations',   icon: Building2,       exact: false },
    { href: '/admin/system',        label: 'System',          icon: Activity,        exact: false },
  ]},
  { label: 'People & access', items: [
    { href: '/admin/people',        label: 'People',          icon: UserCheck,       exact: false },
    { href: '/admin/access',        label: 'Access Control',  icon: ShieldCheck,     exact: false },
    { href: '/admin/invites',       label: 'Invite Codes',    icon: Key,             exact: false },
    { href: '/admin/impersonation', label: 'View-as Log',     icon: History,         exact: false },
  ]},
  { label: 'Intelligence', items: [
    { href: '/admin/training',      label: 'Model Training',  icon: Brain,           exact: false },
  ]},
];

const CSS = `
.adm-nav a{display:flex;align-items:center;gap:10px;padding:8px 12px;border-radius:7px;margin-bottom:2px;text-decoration:none;border:1px solid transparent;color:#64748b;font-size:13px;transition:background .15s,color .15s}
.adm-nav a:hover{background:rgba(255,255,255,.04);color:#94a3b8}
.adm-nav a[aria-current="page"]{background:rgba(13,148,136,.12);border-color:rgba(13,148,136,.2);color:#e2e8f0;font-weight:600}
.adm-back{display:flex;align-items:center;gap:7px;font-size:12px;color:#475569;text-decoration:none;margin-bottom:14px;transition:color .15s}
.adm-back:hover{color:#94a3b8}
`;

export function AdminNav({ userEmail }: { userEmail: string }) {
  const pathname = usePathname();
  const displayName = userEmail.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

  return (
    <aside style={{ width: 220, flexShrink: 0, background: '#040a12', borderRight: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', minHeight: '100vh', position: 'sticky', top: 0 }}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      <div style={{ padding: '22px 20px 18px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <div style={{ width: 30, height: 30, background: 'linear-gradient(135deg, #0d9488, #0f766e)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 12px rgba(13,148,136,0.4)' }}>
            <Zap size={15} color="white" strokeWidth={2.5} />
          </div>
          <span style={{ fontSize: 16, fontWeight: 800, color: '#fff', letterSpacing: '-0.01em' }}>Fundir</span>
        </div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 5, padding: '3px 8px' }}>
          <Shield size={10} color="#f87171" />
          <span style={{ fontSize: 10, fontWeight: 700, color: '#f87171', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Admin Console</span>
        </div>
      </div>

      <nav className="adm-nav" style={{ flex: 1, padding: '10px 10px' }}>
        {GROUPS.map(g => (
          <div key={g.label} style={{ marginBottom: 14 }}>
            <p style={{ fontSize: 9.5, fontWeight: 700, color: '#334155', letterSpacing: '0.12em', textTransform: 'uppercase', margin: '6px 12px 6px' }}>{g.label}</p>
            {g.items.map(({ href, label, icon: Icon, exact }) => {
              const active = exact ? pathname === href : pathname.startsWith(href);
              return (
                <Link key={href} href={href} aria-current={active ? 'page' : undefined}>
                  <Icon size={15} color={active ? '#0d9488' : 'currentColor'} strokeWidth={active ? 2.5 : 2} />
                  <span>{label}</span>
                  {active && <span style={{ marginLeft: 'auto', width: 5, height: 5, borderRadius: '50%', background: '#0d9488' }} />}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div style={{ padding: '16px 20px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <Link href="/dashboard" className="adm-back"><ArrowLeft size={12} />Back to App</Link>
        <div style={{ padding: '10px 12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8 }}>
          <p style={{ fontSize: 11, fontWeight: 600, color: '#e2e8f0', margin: 0, lineHeight: 1.3 }}>{displayName}</p>
          <p style={{ fontSize: 10, color: '#475569', margin: '2px 0 0', wordBreak: 'break-all' }}>{userEmail}</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 6 }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#22c55e' }} />
            <span style={{ fontSize: 10, color: '#22c55e', fontWeight: 600 }}>Platform admin</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
