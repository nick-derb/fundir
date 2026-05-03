'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Zap, ArrowRight, Eye, EyeOff, Search, X, Loader2,
  MapPin, Building2, CheckCircle, ChevronDown, Calendar,
  Lock, Mail, Hash, Globe, Flag,
} from 'lucide-react';
import { OrgSearchResult } from '@/lib/propublica';
import { CountyPicker, LocationItem } from '@/components/county-picker';

// ─── Types ────────────────────────────────────────────────────────────────────

interface FormData {
  inviteCode: string;
  email: string;
  password: string;
  orgName: string;
  ein: string;
  city: string;
  state: string;
  registrationScope: 'inside' | 'outside' | 'both';
  locations: LocationItem[];
  fiscalYear: string;
  fiscalYearStart: string;
  fiscalYearEnd: string;
}

const FISCAL_YEAR_OPTIONS = [
  { label: 'January 1 – December 31 (Calendar Year)', value: 'jan', start: '01-01', end: '12-31' },
  { label: 'July 1 – June 30', value: 'jul', start: '07-01', end: '06-30' },
  { label: 'October 1 – September 30', value: 'oct', start: '10-01', end: '09-30' },
  { label: 'April 1 – March 31', value: 'apr', start: '04-01', end: '03-31' },
];

const INITIAL_FORM: FormData = {
  inviteCode: '',
  email: '',
  password: '',
  orgName: '',
  ein: '',
  city: '',
  state: '',
  registrationScope: 'inside',
  locations: [],
  fiscalYear: 'jan',
  fiscalYearStart: '01-01',
  fiscalYearEnd: '12-31',
};

// ─── Step progress indicator ──────────────────────────────────────────────────

interface StepInfo {
  num: number;
  title: string;
  desc: string;
}

const STEPS: StepInfo[] = [
  { num: 1, title: 'Access Code',       desc: 'Verify your invite'        },
  { num: 2, title: 'Account Setup',     desc: 'Create your credentials'   },
  { num: 3, title: 'Org Profile',       desc: 'Tell us about your org'    },
  { num: 4, title: 'All Set',           desc: 'You\'re in!'               },
];

// ─── EIN search result formatter ─────────────────────────────────────────────

function formatEin(ein: string): string {
  const d = ein.replace(/\D/g, '');
  if (d.length === 9) return `${d.slice(0, 2)}-${d.slice(2)}`;
  return ein;
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<FormData>(INITIAL_FORM);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // EIN search state
  const [einQuery, setEinQuery] = useState('');
  const [einResults, setEinResults] = useState<OrgSearchResult[]>([]);
  const [einSearching, setEinSearching] = useState(false);
  const [einDropdownOpen, setEinDropdownOpen] = useState(false);
  const [selectedOrg, setSelectedOrg] = useState<OrgSearchResult | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const einContainerRef = useRef<HTMLDivElement>(null);

  // County picker state
  const [pickerOpen, setPickerOpen] = useState(false);

  // Pre-fill invite code from URL param ?code=YMCA2025 and auto-advance
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const codeParam = params.get('code');
    if (codeParam && codeParam.trim().length >= 5) {
      const upper = codeParam.trim().toUpperCase();
      setForm(prev => ({ ...prev, inviteCode: upper }));
      setStep(2);
    }
  }, []);

  // Close EIN dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (einContainerRef.current && !einContainerRef.current.contains(e.target as Node)) {
        setEinDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  function setField<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm(prev => ({ ...prev, [key]: value }));
    setError('');
  }

  // ── Step 1: Invite code ──────────────────────────────────────────────────
  function handleStep1() {
    const code = form.inviteCode.trim().toUpperCase();
    if (!code) { setError('Please enter your invite code.'); return; }
    if (code.length < 5) { setError('Invite code looks too short.'); return; }
    setField('inviteCode', code);
    setStep(2);
    setError('');
  }

  // ── Step 2: Account setup ────────────────────────────────────────────────
  function handleStep2() {
    if (!form.email) { setError('Email is required.'); return; }
    if (!form.email.includes('@')) { setError('Please enter a valid email.'); return; }
    if (!form.password) { setError('Password is required.'); return; }
    if (form.password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    setStep(3);
    setError('');
  }

  // ── EIN search ───────────────────────────────────────────────────────────
  function handleEinInput(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setEinQuery(val);
    setSelectedOrg(null);
    setField('ein', '');
    setField('orgName', '');

    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (val.trim().length < 2) {
      setEinResults([]);
      setEinDropdownOpen(false);
      setEinSearching(false);
      return;
    }

    setEinSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/orgs/search?q=${encodeURIComponent(val)}`);
        const data: OrgSearchResult[] = await res.json();
        setEinResults(data);
        setEinDropdownOpen(data.length > 0);
      } catch {
        setEinResults([]);
      } finally {
        setEinSearching(false);
      }
    }, 300);
  }

  function handleSelectOrg(org: OrgSearchResult) {
    setSelectedOrg(org);
    setEinQuery(org.name);
    setEinDropdownOpen(false);
    setField('ein', org.ein);
    setField('orgName', org.name);
    setField('city', org.city);
    setField('state', org.state);
  }

  function handleClearOrg() {
    setSelectedOrg(null);
    setEinQuery('');
    setEinResults([]);
    setEinDropdownOpen(false);
    setField('ein', '');
    setField('orgName', '');
    setField('city', '');
    setField('state', '');
  }

  // ── Step 3: Submit ───────────────────────────────────────────────────────
  async function handleStep3() {
    if (!form.ein && !form.orgName) {
      setError('Please search for and select your organization.');
      return;
    }
    if (form.registrationScope !== 'outside' && form.locations.length === 0) {
      setError('Please select at least one location inside the U.S.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/onboarding/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inviteCode: form.inviteCode,
          email: form.email,
          password: form.password,
          orgName: form.orgName || einQuery,
          ein: form.ein,
          city: form.city,
          state: form.state,
          locations: form.locations,
          fiscalYearStart: form.fiscalYearStart,
          fiscalYearEnd: form.fiscalYearEnd,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? 'Something went wrong. Please try again.');
        setLoading(false);
        return;
      }

      setStep(4);
    } catch {
      setError('Network error. Please check your connection and try again.');
      setLoading(false);
    }
  }

  // ─── Render helpers ────────────────────────────────────────────────────────

  const locationLabel = (loc: LocationItem) => {
    if (!loc.county) return `All of ${loc.state}`;
    return `${loc.county}, ${loc.state}`;
  };

  // ─── Layout ────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#f8fafc' }}>

      {/* ── Left Sidebar ── */}
      <aside style={{
        width: '300px',
        flexShrink: 0,
        background: '#070d1a',
        display: 'flex',
        flexDirection: 'column',
        padding: '40px 32px',
        position: 'relative',
        overflow: 'hidden',
      }}
        className="onboarding-sidebar"
      >
        {/* Background glow orbs */}
        <div style={{
          position: 'absolute', top: '-80px', left: '-80px',
          width: '300px', height: '300px',
          background: 'radial-gradient(circle, rgba(13,148,136,0.15) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />
        <div style={{
          position: 'absolute', bottom: '60px', right: '-60px',
          width: '220px', height: '220px',
          background: 'radial-gradient(circle, rgba(13,148,136,0.08) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />

        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '56px', position: 'relative' }}>
          <div style={{
            width: '36px', height: '36px',
            background: 'linear-gradient(135deg, #0d9488, #0f766e)',
            borderRadius: '10px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 20px rgba(13,148,136,0.4)',
          }}>
            <Zap size={18} color="white" strokeWidth={2.5} />
          </div>
          <span style={{ fontSize: '20px', fontWeight: 800, color: '#ffffff', letterSpacing: '-0.02em' }}>
            Fundir
          </span>
        </div>

        {/* Step progress */}
        <div style={{ flex: 1, position: 'relative' }}>
          {STEPS.map((s, i) => {
            const isDone = step > s.num;
            const isActive = step === s.num;

            return (
              <div key={s.num} style={{ display: 'flex', gap: '16px', marginBottom: i < STEPS.length - 1 ? '0' : '0' }}>
                {/* Connector column */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '28px' }}>
                  {/* Circle */}
                  <div style={{
                    width: '28px', height: '28px',
                    borderRadius: '50%',
                    border: isDone
                      ? '2px solid #0d9488'
                      : isActive
                        ? '2px solid #0d9488'
                        : '2px solid rgba(255,255,255,0.15)',
                    background: isDone
                      ? '#0d9488'
                      : isActive
                        ? 'transparent'
                        : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                    position: 'relative',
                    ...(isActive ? {
                      boxShadow: '0 0 0 4px rgba(13,148,136,0.2), 0 0 16px rgba(13,148,136,0.3)',
                    } : {}),
                    transition: 'all 0.3s ease',
                  }}>
                    {isDone ? (
                      <CheckCircle size={14} color="white" strokeWidth={2.5} />
                    ) : (
                      <span style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        color: isActive ? '#0d9488' : 'rgba(255,255,255,0.3)',
                      }}>
                        {s.num}
                      </span>
                    )}
                  </div>

                  {/* Vertical line */}
                  {i < STEPS.length - 1 && (
                    <div style={{
                      width: '2px',
                      flex: 1,
                      minHeight: '48px',
                      background: isDone
                        ? 'linear-gradient(to bottom, #0d9488, rgba(13,148,136,0.3))'
                        : 'rgba(255,255,255,0.08)',
                      margin: '4px 0',
                      transition: 'background 0.3s ease',
                    }} />
                  )}
                </div>

                {/* Label */}
                <div style={{ paddingTop: '4px', paddingBottom: i < STEPS.length - 1 ? '48px' : '0' }}>
                  <p style={{
                    fontSize: '13px',
                    fontWeight: isActive ? 700 : 500,
                    color: isDone
                      ? '#0d9488'
                      : isActive
                        ? '#ffffff'
                        : 'rgba(255,255,255,0.35)',
                    margin: 0,
                    lineHeight: 1.3,
                    transition: 'color 0.3s ease',
                  }}>
                    {s.title}
                  </p>
                  <p style={{
                    fontSize: '11px',
                    color: isActive ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.2)',
                    margin: '2px 0 0',
                    transition: 'color 0.3s ease',
                  }}>
                    {s.desc}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Bottom tagline */}
        <div style={{ position: 'relative' }}>
          <p style={{
            fontSize: '12px',
            color: 'rgba(255,255,255,0.25)',
            lineHeight: 1.6,
            margin: 0,
          }}>
            AI-powered grant intelligence<br />
            for nonprofits that matter.
          </p>
          <div style={{
            marginTop: '16px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}>
            <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#0d9488' }} />
            <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.2)' }}>Invite-only beta</span>
          </div>
        </div>
      </aside>

      {/* ── Right Content ── */}
      <main style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 24px',
        minHeight: '100vh',
        background: '#f8fafc',
        overflowY: 'auto',
      }}>

        {/* Mobile header (hidden on desktop) */}
        <div className="onboarding-mobile-header" style={{ display: 'none', width: '100%', marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              width: '28px', height: '28px',
              background: '#0d9488',
              borderRadius: '7px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Zap size={14} color="white" />
            </div>
            <span style={{ fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>Fundir</span>
          </div>
          <span style={{ fontSize: '12px', color: '#94a3b8', marginLeft: 'auto' }}>
            Step {step} of 4
          </span>
        </div>

        <div style={{ width: '100%', maxWidth: '520px' }}>

          {/* ── STEP 1: Invite Code ── */}
          {step === 1 && (
            <div>
              <div style={{ marginBottom: '40px' }}>
                <div style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: '#f0fdfa',
                  border: '1px solid #99f6e4',
                  borderRadius: '999px',
                  padding: '4px 12px',
                  marginBottom: '20px',
                }}>
                  <Lock size={11} color="#0d9488" strokeWidth={2.5} />
                  <span style={{ fontSize: '11px', fontWeight: 600, color: '#0d9488', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                    Invite Only
                  </span>
                </div>
                <h1 style={{
                  fontSize: '32px', fontWeight: 800, color: '#0f172a',
                  margin: 0, lineHeight: 1.15, letterSpacing: '-0.02em',
                }}>
                  Welcome to Fundir
                </h1>
                <p style={{
                  fontSize: '16px', color: '#64748b',
                  margin: '12px 0 0', lineHeight: 1.6,
                }}>
                  AI-powered grant intelligence, built for nonprofits.
                </p>
              </div>

              <div style={{
                background: 'white',
                border: '1px solid #e2e8f0',
                borderRadius: '16px',
                padding: '32px',
                boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
              }}>
                <label style={{
                  display: 'block',
                  fontSize: '12px',
                  fontWeight: 700,
                  color: '#475569',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  marginBottom: '8px',
                }}>
                  Invite Code
                </label>
                <div style={{ position: 'relative' }}>
                  <div style={{
                    position: 'absolute', left: '14px', top: '50%',
                    transform: 'translateY(-50%)',
                    color: '#94a3b8', pointerEvents: 'none', display: 'flex',
                  }}>
                    <Hash size={16} />
                  </div>
                  <input
                    type="text"
                    value={form.inviteCode}
                    onChange={e => setField('inviteCode', e.target.value.toUpperCase())}
                    onKeyDown={e => { if (e.key === 'Enter') handleStep1(); }}
                    placeholder="FUNDIR2025"
                    autoFocus
                    style={{
                      width: '100%',
                      paddingLeft: '42px',
                      paddingRight: '16px',
                      paddingTop: '14px',
                      paddingBottom: '14px',
                      border: '1.5px solid #e2e8f0',
                      borderRadius: '10px',
                      fontSize: '18px',
                      fontFamily: 'JetBrains Mono, ui-monospace, monospace',
                      fontWeight: 600,
                      color: '#0f172a',
                      letterSpacing: '0.1em',
                      outline: 'none',
                      boxSizing: 'border-box',
                      transition: 'border-color 0.15s, box-shadow 0.15s',
                      background: 'white',
                    }}
                    onFocus={e => {
                      e.currentTarget.style.borderColor = '#0d9488';
                      e.currentTarget.style.boxShadow = '0 0 0 3px rgba(13,148,136,0.12)';
                    }}
                    onBlur={e => {
                      e.currentTarget.style.borderColor = '#e2e8f0';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  />
                </div>
                <p style={{ fontSize: '12px', color: '#94a3b8', marginTop: '8px' }}>
                  Provided by your Fundir account manager.
                </p>

                {error && (
                  <div style={{
                    marginTop: '16px',
                    padding: '12px 14px',
                    background: '#fef2f2',
                    border: '1px solid #fecaca',
                    borderRadius: '8px',
                    fontSize: '13px',
                    color: '#dc2626',
                  }}>
                    {error}
                  </div>
                )}

                <button
                  onClick={handleStep1}
                  style={{
                    marginTop: '24px',
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    padding: '14px',
                    background: 'linear-gradient(135deg, #0d9488, #0f766e)',
                    border: 'none',
                    borderRadius: '10px',
                    color: 'white',
                    fontSize: '15px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    boxShadow: '0 4px 16px rgba(13,148,136,0.35)',
                    transition: 'transform 0.1s, box-shadow 0.1s',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.transform = 'translateY(-1px)';
                    e.currentTarget.style.boxShadow = '0 6px 20px rgba(13,148,136,0.45)';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = '0 4px 16px rgba(13,148,136,0.35)';
                  }}
                >
                  Continue
                  <ArrowRight size={16} strokeWidth={2.5} />
                </button>
              </div>
            </div>
          )}

          {/* ── STEP 2: Account Setup ── */}
          {step === 2 && (
            <div>
              <div style={{ marginBottom: '32px' }}>
                <button
                  onClick={() => { setStep(1); setError(''); }}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    fontSize: '13px', color: '#94a3b8',
                    display: 'flex', alignItems: 'center', gap: '4px',
                    marginBottom: '20px', padding: 0,
                  }}
                >
                  ← Back
                </button>
                <h1 style={{
                  fontSize: '28px', fontWeight: 800, color: '#0f172a',
                  margin: 0, letterSpacing: '-0.02em',
                }}>
                  Create your account
                </h1>
                <p style={{ fontSize: '15px', color: '#64748b', margin: '8px 0 0' }}>
                  Your personal login credentials for Fundir.
                </p>
              </div>

              <div style={{
                background: 'white',
                border: '1px solid #e2e8f0',
                borderRadius: '16px',
                padding: '32px',
                boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
              }}>
                {/* Email */}
                <div style={{ marginBottom: '20px' }}>
                  <label style={labelStyle}>Work Email</label>
                  <div style={{ position: 'relative' }}>
                    <Mail size={15} style={{ position: 'absolute', left: '13px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', pointerEvents: 'none' }} />
                    <input
                      type="email"
                      value={form.email}
                      onChange={e => setField('email', e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleStep2(); }}
                      placeholder="you@organization.org"
                      autoFocus
                      style={inputStyle}
                      onFocus={focusStyle}
                      onBlur={blurStyle}
                    />
                  </div>
                </div>

                {/* Password */}
                <div style={{ marginBottom: '8px' }}>
                  <label style={labelStyle}>Password</label>
                  <div style={{ position: 'relative' }}>
                    <Lock size={15} style={{ position: 'absolute', left: '13px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', pointerEvents: 'none' }} />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={form.password}
                      onChange={e => setField('password', e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleStep2(); }}
                      placeholder="Min. 8 characters"
                      minLength={8}
                      style={{ ...inputStyle, paddingRight: '42px' }}
                      onFocus={focusStyle}
                      onBlur={blurStyle}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      style={{
                        position: 'absolute', right: '12px', top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: '#94a3b8', display: 'flex', padding: 0,
                      }}
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  {form.password && (
                    <PasswordStrengthBar password={form.password} />
                  )}
                </div>

                {error && <ErrorBox message={error} />}

                <button
                  onClick={handleStep2}
                  style={primaryButtonStyle}
                  onMouseEnter={buttonHoverIn}
                  onMouseLeave={buttonHoverOut}
                >
                  Continue <ArrowRight size={16} strokeWidth={2.5} />
                </button>
              </div>
            </div>
          )}

          {/* ── STEP 3: Org Profile ── */}
          {step === 3 && (
            <div>
              <div style={{ marginBottom: '28px' }}>
                <button
                  onClick={() => { setStep(2); setError(''); }}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    fontSize: '13px', color: '#94a3b8',
                    display: 'flex', alignItems: 'center', gap: '4px',
                    marginBottom: '16px', padding: 0,
                  }}
                >
                  ← Back
                </button>
                <h1 style={{
                  fontSize: '28px', fontWeight: 800, color: '#0f172a',
                  margin: 0, letterSpacing: '-0.02em',
                }}>
                  {"Let's create your profile"}
                </h1>
                <p style={{ fontSize: '15px', color: '#64748b', margin: '8px 0 0', lineHeight: 1.5 }}>
                  We use this information to match you with relevant grants.
                </p>
              </div>

              <div style={{
                background: 'white',
                border: '1px solid #e2e8f0',
                borderRadius: '16px',
                padding: '32px',
                boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
              }}>

                {/* ── EIN Search ── */}
                <SectionHeader icon={<Building2 size={15} color="#0d9488" />} title="Organization EIN" />
                <p style={{ fontSize: '13px', color: '#64748b', marginTop: '4px', marginBottom: '16px', lineHeight: 1.5 }}>
                  Search the IRS nonprofit database to find your organization.
                </p>

                <div ref={einContainerRef} style={{ position: 'relative', marginBottom: '8px' }}>
                  {selectedOrg ? (
                    /* Selected org chip */
                    <div style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '12px',
                      padding: '14px 16px',
                      background: '#f0fdfa',
                      border: '1.5px solid #99f6e4',
                      borderRadius: '10px',
                    }}>
                      <div style={{
                        width: '36px', height: '36px',
                        background: '#0d9488',
                        borderRadius: '8px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0,
                      }}>
                        <Building2 size={18} color="white" />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a', margin: 0, lineHeight: 1.3 }}>
                          {selectedOrg.name}
                        </p>
                        <p style={{ fontSize: '12px', color: '#64748b', margin: '3px 0 0' }}>
                          EIN {formatEin(selectedOrg.ein)} · {selectedOrg.city}, {selectedOrg.state}
                        </p>
                      </div>
                      <button
                        onClick={handleClearOrg}
                        style={{
                          background: 'none', border: 'none', cursor: 'pointer',
                          color: '#94a3b8', padding: '2px', display: 'flex', flexShrink: 0,
                        }}
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ) : (
                    <>
                      <div style={{ position: 'relative' }}>
                        <div style={{
                          position: 'absolute', left: '13px', top: '50%',
                          transform: 'translateY(-50%)',
                          color: '#94a3b8', pointerEvents: 'none', display: 'flex',
                        }}>
                          {einSearching
                            ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} />
                            : <Search size={15} />
                          }
                        </div>
                        <input
                          type="text"
                          value={einQuery}
                          onChange={handleEinInput}
                          onFocus={e => {
                            if (einResults.length > 0) setEinDropdownOpen(true);
                            focusStyle(e);
                          }}
                          onBlur={blurStyle}
                          placeholder="Search by organization name (e.g. YMCA Chicago)"
                          style={{ ...inputStyle, paddingRight: einQuery ? '40px' : '16px' }}
                        />
                        {einQuery && !selectedOrg && (
                          <button
                            onClick={handleClearOrg}
                            style={{
                              position: 'absolute', right: '12px', top: '50%',
                              transform: 'translateY(-50%)',
                              background: 'none', border: 'none', cursor: 'pointer',
                              color: '#94a3b8', display: 'flex', padding: 0,
                            }}
                          >
                            <X size={14} />
                          </button>
                        )}
                      </div>

                      {/* Dropdown results */}
                      {einDropdownOpen && einResults.length > 0 && (
                        <div style={{
                          position: 'absolute',
                          left: 0, right: 0,
                          top: 'calc(100% + 4px)',
                          background: 'white',
                          border: '1.5px solid #e2e8f0',
                          borderRadius: '10px',
                          boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
                          zIndex: 100,
                          overflow: 'hidden',
                        }}>
                          <div style={{
                            padding: '8px 14px 6px',
                            borderBottom: '1px solid #f1f5f9',
                            background: '#f8fafc',
                          }}>
                            <p style={{ fontSize: '11px', color: '#94a3b8', margin: 0 }}>
                              {einResults.length} result{einResults.length !== 1 ? 's' : ''} · click to select
                            </p>
                          </div>
                          <div style={{ maxHeight: '280px', overflowY: 'auto' }}>
                            {einResults.map(org => (
                              <button
                                key={org.ein}
                                onClick={() => handleSelectOrg(org)}
                                style={{
                                  width: '100%',
                                  display: 'flex',
                                  alignItems: 'flex-start',
                                  justifyContent: 'space-between',
                                  gap: '12px',
                                  padding: '12px 16px',
                                  background: 'none',
                                  border: 'none',
                                  borderBottom: '1px solid #f8fafc',
                                  cursor: 'pointer',
                                  textAlign: 'left',
                                  transition: 'background 0.1s',
                                }}
                                onMouseEnter={e => { e.currentTarget.style.background = '#f0fdfa'; }}
                                onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}
                              >
                                <div style={{ minWidth: 0, flex: 1 }}>
                                  <p style={{
                                    fontSize: '13px', fontWeight: 600, color: '#0f172a',
                                    margin: 0, lineHeight: 1.3,
                                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                  }}>
                                    {org.name}
                                  </p>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '3px', flexWrap: 'wrap' }}>
                                    {org.city && (
                                      <span style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: '11px', color: '#64748b' }}>
                                        <MapPin size={10} /> {org.city}, {org.state}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <span style={{
                                  fontSize: '11px',
                                  fontFamily: 'ui-monospace, monospace',
                                  color: '#94a3b8',
                                  flexShrink: 0,
                                  marginTop: '2px',
                                }}>
                                  {formatEin(org.ein)}
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>

                {!selectedOrg && einQuery.trim().length >= 2 && !einSearching && einResults.length === 0 && (
                  <p style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '16px' }}>
                    No results for &ldquo;{einQuery}&rdquo; — try a shorter name or check spelling.
                  </p>
                )}

                <div style={{ height: '28px' }} />

                {/* ── Registration Location ── */}
                <SectionHeader icon={<MapPin size={15} color="#0d9488" />} title="Where is your organization registered?" required />
                <p style={{ fontSize: '13px', color: '#64748b', marginTop: '4px', marginBottom: '16px', lineHeight: 1.5 }}>
                  List all locations where your organization is registered.
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
                  {(['inside', 'outside', 'both'] as const).map(scope => {
                    const labels = {
                      inside: 'Inside the United States',
                      outside: 'Outside the United States',
                      both: 'Both inside and outside the United States',
                    };
                    const active = form.registrationScope === scope;
                    return (
                      <label
                        key={scope}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          padding: '11px 14px',
                          border: active ? '1.5px solid #0d9488' : '1.5px solid #e2e8f0',
                          borderRadius: '8px',
                          background: active ? '#f0fdfa' : 'white',
                          cursor: 'pointer',
                          transition: 'all 0.15s',
                        }}
                      >
                        <div style={{
                          width: '18px', height: '18px',
                          border: active ? '5px solid #0d9488' : '2px solid #cbd5e1',
                          borderRadius: '50%',
                          background: 'white',
                          flexShrink: 0,
                          transition: 'border 0.15s',
                        }}
                          onClick={() => {
                            setField('registrationScope', scope);
                            if (scope === 'outside') setField('locations', []);
                          }}
                        />
                        <span
                          style={{ fontSize: '13px', fontWeight: active ? 600 : 400, color: active ? '#0d9488' : '#0f172a', cursor: 'pointer' }}
                          onClick={() => {
                            setField('registrationScope', scope);
                            if (scope === 'outside') setField('locations', []);
                          }}
                        >
                          {labels[scope]}
                        </span>
                      </label>
                    );
                  })}
                </div>

                {/* US Locations box */}
                {(form.registrationScope === 'inside' || form.registrationScope === 'both') && (
                  <div style={{
                    border: '1.5px solid #e2e8f0',
                    borderRadius: '10px',
                    overflow: 'hidden',
                    marginBottom: '24px',
                  }}>
                    <div style={{
                      padding: '10px 14px',
                      background: '#f8fafc',
                      borderBottom: '1px solid #e2e8f0',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}>
                      <span style={{ fontSize: '11px', fontWeight: 700, color: '#475569', letterSpacing: '0.07em', textTransform: 'uppercase' }}>
                        Locations Inside the U.S.
                      </span>
                      {form.locations.length > 0 && (
                        <span style={{
                          fontSize: '11px',
                          fontWeight: 600,
                          color: '#0d9488',
                          background: '#f0fdfa',
                          border: '1px solid #99f6e4',
                          borderRadius: '999px',
                          padding: '1px 8px',
                        }}>
                          {form.locations.length} selected
                        </span>
                      )}
                    </div>
                    <div style={{ padding: '14px' }}>
                      {form.locations.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '12px' }}>
                          {form.locations.map((loc, i) => (
                            <span
                              key={i}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '5px',
                                padding: '4px 10px',
                                background: '#f0fdfa',
                                border: '1px solid #99f6e4',
                                borderRadius: '999px',
                                fontSize: '12px',
                                color: '#0f172a',
                                fontWeight: 500,
                              }}
                            >
                              <MapPin size={10} color="#0d9488" />
                              {locationLabel(loc)}
                              <button
                                onClick={() => setField('locations', form.locations.filter((_, j) => j !== i))}
                                style={{
                                  background: 'none', border: 'none', cursor: 'pointer',
                                  padding: '0 0 0 2px', color: '#94a3b8', display: 'flex',
                                  lineHeight: 1,
                                }}
                              >
                                <X size={11} />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                      <button
                        onClick={() => setPickerOpen(true)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '8px 14px',
                          border: '1.5px dashed #cbd5e1',
                          borderRadius: '8px',
                          background: 'none',
                          cursor: 'pointer',
                          fontSize: '13px',
                          fontWeight: 500,
                          color: '#475569',
                          transition: 'all 0.15s',
                          width: '100%',
                          justifyContent: 'center',
                        }}
                        onMouseEnter={e => {
                          e.currentTarget.style.borderColor = '#0d9488';
                          e.currentTarget.style.color = '#0d9488';
                          e.currentTarget.style.background = '#f0fdfa';
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.borderColor = '#cbd5e1';
                          e.currentTarget.style.color = '#475569';
                          e.currentTarget.style.background = 'none';
                        }}
                      >
                        <MapPin size={14} />
                        {form.locations.length === 0 ? '+ Select county or state' : 'Edit locations'}
                      </button>
                    </div>
                  </div>
                )}

                {/* ── Fiscal Year ── */}
                <SectionHeader icon={<Calendar size={15} color="#0d9488" />} title="Fiscal year" />
                <p style={{ fontSize: '13px', color: '#64748b', marginTop: '4px', marginBottom: '12px', lineHeight: 1.5 }}>
                  We show grant deadlines according to your yearly schedule.
                </p>

                <div style={{ position: 'relative' }}>
                  <select
                    value={form.fiscalYear}
                    onChange={e => {
                      const opt = FISCAL_YEAR_OPTIONS.find(o => o.value === e.target.value);
                      if (opt) {
                        setField('fiscalYear', opt.value);
                        setField('fiscalYearStart', opt.start);
                        setField('fiscalYearEnd', opt.end);
                      }
                    }}
                    style={{
                      width: '100%',
                      padding: '12px 40px 12px 14px',
                      border: '1.5px solid #e2e8f0',
                      borderRadius: '10px',
                      fontSize: '13px',
                      color: '#0f172a',
                      appearance: 'none',
                      background: 'white',
                      cursor: 'pointer',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                    onFocus={e => { e.currentTarget.style.borderColor = '#0d9488'; }}
                    onBlur={e => { e.currentTarget.style.borderColor = '#e2e8f0'; }}
                  >
                    {FISCAL_YEAR_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                  <ChevronDown size={15} style={{
                    position: 'absolute', right: '14px', top: '50%',
                    transform: 'translateY(-50%)',
                    color: '#94a3b8', pointerEvents: 'none',
                  }} />
                </div>

                {error && <ErrorBox message={error} style={{ marginTop: '20px' }} />}

                <button
                  onClick={handleStep3}
                  disabled={loading}
                  style={{
                    ...primaryButtonStyle,
                    marginTop: '28px',
                    opacity: loading ? 0.7 : 1,
                    cursor: loading ? 'not-allowed' : 'pointer',
                  }}
                  onMouseEnter={loading ? undefined : buttonHoverIn}
                  onMouseLeave={loading ? undefined : buttonHoverOut}
                >
                  {loading ? (
                    <>
                      <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                      Creating your account…
                    </>
                  ) : (
                    <>
                      Save and Continue <ArrowRight size={16} strokeWidth={2.5} />
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* ── STEP 4: Success ── */}
          {step === 4 && (
            <div style={{ textAlign: 'center' }}>
              <div style={{
                width: '80px', height: '80px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #f0fdfa, #ccfbf1)',
                border: '2px solid #99f6e4',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 28px',
                position: 'relative',
              }}>
                {/* Animated checkmark */}
                <svg
                  viewBox="0 0 52 52"
                  width="40" height="40"
                  fill="none"
                >
                  <circle cx="26" cy="26" r="25" stroke="#0d9488" strokeWidth="2" fill="none"
                    style={{
                      strokeDasharray: '157',
                      strokeDashoffset: '0',
                      animation: 'dash-circle 0.6s ease forwards',
                    }}
                  />
                  <polyline
                    points="14,27 22,35 38,18"
                    stroke="#0d9488" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
                    style={{
                      strokeDasharray: '40',
                      strokeDashoffset: '0',
                      animation: 'dash-check 0.4s 0.5s ease forwards',
                    }}
                  />
                </svg>
              </div>

              <h1 style={{
                fontSize: '32px', fontWeight: 800, color: '#0f172a',
                margin: '0 0 12px', letterSpacing: '-0.02em',
              }}>
                {"You're all set!"}
              </h1>
              <p style={{ fontSize: '16px', color: '#64748b', margin: '0 0 8px', lineHeight: 1.6 }}>
                Your organization dashboard is ready.
              </p>
              <p style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '40px' }}>
                {"We've set up your grant intelligence profile."}
              </p>

              {/* Feature highlights */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 1fr',
                gap: '12px',
                marginBottom: '36px',
              }}>
                {[
                  { icon: <Search size={20} color="#0d9488" />, label: 'Grant Discovery' },
                  { icon: <Flag size={20} color="#0d9488" />, label: 'AI Matching' },
                  { icon: <Globe size={20} color="#0d9488" />, label: 'Deadline Tracking' },
                ].map(item => (
                  <div key={item.label} style={{
                    padding: '16px 12px',
                    background: 'white',
                    border: '1px solid #e2e8f0',
                    borderRadius: '10px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '8px',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                  }}>
                    {item.icon}
                    <span style={{ fontSize: '12px', fontWeight: 600, color: '#475569' }}>{item.label}</span>
                  </div>
                ))}
              </div>

              <button
                onClick={() => router.push('/dashboard')}
                style={primaryButtonStyle}
                onMouseEnter={buttonHoverIn}
                onMouseLeave={buttonHoverOut}
              >
                Open Dashboard <ArrowRight size={16} strokeWidth={2.5} />
              </button>
            </div>
          )}
        </div>
      </main>

      {/* County Picker Modal */}
      {pickerOpen && (
        <CountyPicker
          selected={form.locations}
          onChange={locs => setField('locations', locs)}
          onClose={() => setPickerOpen(false)}
        />
      )}

      {/* Spin keyframes */}
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes dash-circle {
          from { stroke-dashoffset: 157; }
          to   { stroke-dashoffset: 0; }
        }
        @keyframes dash-check {
          from { stroke-dashoffset: 40; }
          to   { stroke-dashoffset: 0; }
        }
        @media (max-width: 768px) {
          .onboarding-sidebar { display: none !important; }
          .onboarding-mobile-header { display: flex !important; align-items: center; }
        }
      `}</style>
    </div>
  );
}

// ─── Shared style helpers ─────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '12px',
  fontWeight: 700,
  color: '#475569',
  letterSpacing: '0.07em',
  textTransform: 'uppercase',
  marginBottom: '7px',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  paddingLeft: '40px',
  paddingRight: '16px',
  paddingTop: '12px',
  paddingBottom: '12px',
  border: '1.5px solid #e2e8f0',
  borderRadius: '10px',
  fontSize: '14px',
  color: '#0f172a',
  outline: 'none',
  boxSizing: 'border-box',
  transition: 'border-color 0.15s, box-shadow 0.15s',
  background: 'white',
  fontFamily: 'inherit',
};

const primaryButtonStyle: React.CSSProperties = {
  marginTop: '20px',
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '8px',
  padding: '14px',
  background: 'linear-gradient(135deg, #0d9488, #0f766e)',
  border: 'none',
  borderRadius: '10px',
  color: 'white',
  fontSize: '15px',
  fontWeight: 700,
  cursor: 'pointer',
  boxShadow: '0 4px 16px rgba(13,148,136,0.35)',
  transition: 'transform 0.1s, box-shadow 0.1s',
  fontFamily: 'inherit',
};

function focusStyle(e: React.FocusEvent<HTMLInputElement>) {
  e.currentTarget.style.borderColor = '#0d9488';
  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(13,148,136,0.12)';
}

function blurStyle(e: React.FocusEvent<HTMLInputElement>) {
  e.currentTarget.style.borderColor = '#e2e8f0';
  e.currentTarget.style.boxShadow = 'none';
}

function buttonHoverIn(e: React.MouseEvent<HTMLButtonElement>) {
  e.currentTarget.style.transform = 'translateY(-1px)';
  e.currentTarget.style.boxShadow = '0 6px 20px rgba(13,148,136,0.45)';
}

function buttonHoverOut(e: React.MouseEvent<HTMLButtonElement>) {
  e.currentTarget.style.transform = 'translateY(0)';
  e.currentTarget.style.boxShadow = '0 4px 16px rgba(13,148,136,0.35)';
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHeader({
  icon,
  title,
  required,
}: {
  icon: React.ReactNode;
  title: string;
  required?: boolean;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
      <div style={{
        width: '28px', height: '28px',
        background: '#f0fdfa',
        borderRadius: '6px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        {icon}
      </div>
      <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a', margin: 0 }}>
        {title}
        {required && <span style={{ color: '#ef4444', marginLeft: '4px' }}>*</span>}
      </h3>
    </div>
  );
}

function ErrorBox({ message, style: extraStyle }: { message: string; style?: React.CSSProperties }) {
  return (
    <div style={{
      padding: '12px 14px',
      background: '#fef2f2',
      border: '1px solid #fecaca',
      borderRadius: '8px',
      fontSize: '13px',
      color: '#dc2626',
      lineHeight: 1.5,
      ...extraStyle,
    }}>
      {message}
    </div>
  );
}

function PasswordStrengthBar({ password }: { password: string }) {
  const strength = (() => {
    let score = 0;
    if (password.length >= 8) score++;
    if (password.length >= 12) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;
    return score;
  })();

  const label = strength <= 1 ? 'Weak' : strength <= 3 ? 'Fair' : 'Strong';
  const color = strength <= 1 ? '#ef4444' : strength <= 3 ? '#f59e0b' : '#10b981';
  const pct = Math.min(100, (strength / 5) * 100);

  return (
    <div style={{ marginTop: '8px' }}>
      <div style={{
        height: '3px',
        background: '#f1f5f9',
        borderRadius: '999px',
        overflow: 'hidden',
      }}>
        <div style={{
          height: '100%',
          width: `${pct}%`,
          background: color,
          borderRadius: '999px',
          transition: 'width 0.3s ease, background 0.3s ease',
        }} />
      </div>
      <p style={{ fontSize: '11px', color, marginTop: '4px', fontWeight: 500 }}>
        {label}
      </p>
    </div>
  );
}
