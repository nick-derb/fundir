'use client';

import { useState, useEffect, useRef } from 'react';
import { Search, X, Check, ChevronDown, ChevronRight, MapPin } from 'lucide-react';
import { US_COUNTIES } from '@/lib/us-counties';

export interface LocationItem {
  state: string;
  county: string | null; // null = "Everywhere in [State]"
}

interface CountyPickerProps {
  selected: LocationItem[];
  onChange: (locations: LocationItem[]) => void;
  onClose: () => void;
}

function formatEin(ein: string): string {
  const d = ein.replace(/\D/g, '');
  if (d.length === 9) return `${d.slice(0, 2)}-${d.slice(2)}`;
  return ein;
}
void formatEin; // suppress unused warning — kept for potential future use

const STATE_CODES = Object.keys(US_COUNTIES).sort();

export function CountyPicker({ selected, onChange, onClose }: CountyPickerProps) {
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const overlayRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Focus search on open
  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  // Escape to close
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Prevent body scroll while open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const q = query.trim().toLowerCase();

  // Filter states/counties by search query
  const filteredStates = STATE_CODES.filter(code => {
    if (!q) return true;
    const stateData = US_COUNTIES[code];
    const matchesState =
      stateData.name.toLowerCase().includes(q) ||
      code.toLowerCase().includes(q);
    const matchesCounty = stateData.counties.some(c =>
      c.toLowerCase().includes(q)
    );
    return matchesState || matchesCounty;
  });

  function getFilteredCounties(code: string): string[] {
    if (!q) return US_COUNTIES[code].counties;
    const stateData = US_COUNTIES[code];
    const stateMatches =
      stateData.name.toLowerCase().includes(q) ||
      code.toLowerCase().includes(q);
    if (stateMatches) return stateData.counties; // show all counties if state name matches
    return stateData.counties.filter(c => c.toLowerCase().includes(q));
  }

  function isStateEverywhere(code: string): boolean {
    return selected.some(s => s.state === code && s.county === null);
  }

  function isCountySelected(code: string, county: string): boolean {
    return selected.some(s => s.state === code && s.county === county);
  }

  function toggleEverywhereInState(code: string) {
    const isOn = isStateEverywhere(code);
    if (isOn) {
      // Remove "everywhere" and all counties for this state
      onChange(selected.filter(s => s.state !== code));
    } else {
      // Add "everywhere", remove any individual county selections for this state
      const withoutState = selected.filter(s => s.state !== code);
      onChange([...withoutState, { state: code, county: null }]);
    }
  }

  function toggleCounty(code: string, county: string) {
    if (isStateEverywhere(code)) {
      // If "everywhere" is selected, clicking a county switches to individual mode
      const counties = US_COUNTIES[code].counties
        .filter(c => c !== county)
        .map(c => ({ state: code, county: c }));
      const withoutState = selected.filter(s => s.state !== code);
      onChange([...withoutState, ...counties]);
      return;
    }

    const alreadySelected = isCountySelected(code, county);
    if (alreadySelected) {
      onChange(selected.filter(s => !(s.state === code && s.county === county)));
    } else {
      onChange([...selected, { state: code, county }]);
    }
  }

  function toggleStateExpanded(code: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(code)) {
        next.delete(code);
      } else {
        next.add(code);
      }
      return next;
    });
  }

  // Auto-expand states that match search
  useEffect(() => {
    if (q) {
      setExpanded(new Set(filteredStates));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  function handleOverlayClick(e: React.MouseEvent) {
    if (e.target === overlayRef.current) onClose();
  }

  const selectedCount = selected.length;

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '16px',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          backgroundColor: '#ffffff',
          borderRadius: '12px',
          width: '100%',
          maxWidth: '600px',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '24px 24px 0',
          borderBottom: '1px solid #e2e8f0',
          paddingBottom: '20px',
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '4px' }}>
            <div>
              <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#0f172a', margin: 0 }}>
                Select counties and states
              </h2>
              <p style={{ fontSize: '13px', color: '#64748b', margin: '4px 0 0' }}>
                Where is your organization based?
              </p>
            </div>
            <button
              onClick={onClose}
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '6px',
                border: '1px solid #e2e8f0',
                background: 'white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: '#64748b',
                flexShrink: 0,
              }}
            >
              <X size={16} />
            </button>
          </div>

          {/* Search */}
          <div style={{ position: 'relative', marginTop: '16px' }}>
            <Search
              size={15}
              style={{
                position: 'absolute',
                left: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: '#94a3b8',
                pointerEvents: 'none',
              }}
            />
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search states or counties…"
              style={{
                width: '100%',
                paddingLeft: '36px',
                paddingRight: query ? '36px' : '12px',
                paddingTop: '10px',
                paddingBottom: '10px',
                border: '1.5px solid #e2e8f0',
                borderRadius: '8px',
                fontSize: '14px',
                color: '#0f172a',
                outline: 'none',
                transition: 'border-color 0.15s',
                boxSizing: 'border-box',
              }}
              onFocus={e => { e.currentTarget.style.borderColor = '#0d9488'; }}
              onBlur={e => { e.currentTarget.style.borderColor = '#e2e8f0'; }}
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                style={{
                  position: 'absolute',
                  right: '10px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#94a3b8',
                  padding: '2px',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {/* State list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          {filteredStates.length === 0 ? (
            <div style={{ padding: '40px 24px', textAlign: 'center' }}>
              <MapPin size={24} style={{ color: '#cbd5e1', margin: '0 auto 8px' }} />
              <p style={{ fontSize: '14px', color: '#94a3b8' }}>No states or counties match &ldquo;{query}&rdquo;</p>
            </div>
          ) : (
            filteredStates.map(code => {
              const stateData = US_COUNTIES[code];
              const isOpen = expanded.has(code) || !!q;
              const counties = getFilteredCounties(code);
              const everywhereChecked = isStateEverywhere(code);
              const someCountySelected = selected.some(s => s.state === code && s.county !== null);
              const hasAnySelection = everywhereChecked || someCountySelected;

              return (
                <div key={code} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  {/* State header row */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      padding: '10px 24px',
                      cursor: 'pointer',
                      background: hasAnySelection ? '#f0fdfa' : 'transparent',
                      userSelect: 'none',
                    }}
                    onClick={() => toggleStateExpanded(code)}
                  >
                    <span style={{ marginRight: '8px', color: '#94a3b8', display: 'flex', alignItems: 'center' }}>
                      {isOpen
                        ? <ChevronDown size={14} />
                        : <ChevronRight size={14} />
                      }
                    </span>
                    <span style={{
                      fontSize: '13px',
                      fontWeight: 700,
                      color: hasAnySelection ? '#0d9488' : '#0f172a',
                      flex: 1,
                      letterSpacing: '0.02em',
                    }}>
                      {stateData.name}
                      <span style={{
                        marginLeft: '6px',
                        fontSize: '11px',
                        fontWeight: 500,
                        color: '#94a3b8',
                      }}>
                        ({code})
                      </span>
                    </span>
                    {hasAnySelection && (
                      <span style={{
                        fontSize: '11px',
                        fontWeight: 600,
                        color: '#0d9488',
                        background: '#f0fdfa',
                        border: '1px solid #99f6e4',
                        borderRadius: '999px',
                        padding: '1px 8px',
                      }}>
                        {everywhereChecked ? 'All' : `${selected.filter(s => s.state === code).length}`}
                      </span>
                    )}
                  </div>

                  {/* Counties dropdown */}
                  {isOpen && (
                    <div style={{ paddingBottom: '4px' }}>
                      {/* Everywhere in state */}
                      <label
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          padding: '7px 24px 7px 44px',
                          cursor: 'pointer',
                          background: everywhereChecked ? '#f0fdfa' : 'transparent',
                        }}
                      >
                        <span
                          onClick={() => toggleEverywhereInState(code)}
                          style={{
                            width: '16px',
                            height: '16px',
                            border: everywhereChecked ? '1.5px solid #0d9488' : '1.5px solid #cbd5e1',
                            borderRadius: '4px',
                            background: everywhereChecked ? '#0d9488' : 'white',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                            cursor: 'pointer',
                            transition: 'all 0.1s',
                          }}
                        >
                          {everywhereChecked && <Check size={10} color="white" strokeWidth={3} />}
                        </span>
                        <span
                          onClick={() => toggleEverywhereInState(code)}
                          style={{
                            fontSize: '13px',
                            fontWeight: 600,
                            color: everywhereChecked ? '#0d9488' : '#0f172a',
                            cursor: 'pointer',
                          }}
                        >
                          Everywhere in {stateData.name}
                        </span>
                      </label>

                      {/* Individual counties */}
                      {counties.map(county => {
                        const checked = isCountySelected(code, county) || everywhereChecked;
                        return (
                          <label
                            key={county}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '10px',
                              padding: '5px 24px 5px 56px',
                              cursor: 'pointer',
                              background: checked && !everywhereChecked ? '#f8fff7' : 'transparent',
                            }}
                          >
                            <span
                              onClick={() => toggleCounty(code, county)}
                              style={{
                                width: '15px',
                                height: '15px',
                                border: checked ? '1.5px solid #0d9488' : '1.5px solid #e2e8f0',
                                borderRadius: '3px',
                                background: checked ? '#0d9488' : 'white',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0,
                                cursor: 'pointer',
                                transition: 'all 0.1s',
                                opacity: everywhereChecked ? 0.6 : 1,
                              }}
                            >
                              {checked && <Check size={9} color="white" strokeWidth={3} />}
                            </span>
                            <span
                              onClick={() => toggleCounty(code, county)}
                              style={{
                                fontSize: '13px',
                                color: '#475569',
                                cursor: 'pointer',
                              }}
                            >
                              {county} County
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '16px 24px',
          borderTop: '1px solid #e2e8f0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: '#f8fafc',
        }}>
          <span style={{ fontSize: '13px', color: '#64748b' }}>
            {selectedCount === 0
              ? 'No locations selected'
              : `${selectedCount} location${selectedCount !== 1 ? 's' : ''} selected`
            }
          </span>
          <div style={{ display: 'flex', gap: '8px' }}>
            {selectedCount > 0 && (
              <button
                onClick={() => onChange([])}
                style={{
                  padding: '8px 16px',
                  border: '1px solid #e2e8f0',
                  borderRadius: '6px',
                  background: 'white',
                  fontSize: '13px',
                  color: '#64748b',
                  cursor: 'pointer',
                  fontWeight: 500,
                }}
              >
                Clear all
              </button>
            )}
            <button
              onClick={onClose}
              style={{
                padding: '8px 20px',
                border: 'none',
                borderRadius: '6px',
                background: '#0d9488',
                color: 'white',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#0f766e'; }}
              onMouseLeave={e => { e.currentTarget.style.background = '#0d9488'; }}
            >
              Confirm
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
