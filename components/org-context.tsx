'use client';

// The signed-in tenant, for every client component that writes copy about
// "your organization". Provided once by the app shell; read with useOrg().

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { orgShortName, orgPossessive } from '@/lib/org-label';

export interface OrgLabel { name: string; short: string; possessive: string; code: string }

const OrgContext = createContext<OrgLabel>({ name: 'Your organization', short: 'your organization', possessive: 'your organization’s', code: '' });

export function OrgProvider({ name, code, children }: { name: string; code?: string; children: ReactNode }) {
  const value = useMemo<OrgLabel>(() => {
    const short = orgShortName(name);
    return { name, short, possessive: orgPossessive(short), code: code ?? '' };
  }, [name, code]);
  return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>;
}

export const useOrg = () => useContext(OrgContext);

/** Inline tenant short name for JSX copy: "Who at <OrgShort /> knows them". */
export function OrgShort() { return <>{useOrg().short}</>; }
/** Inline full tenant name. */
export function OrgName() { return <>{useOrg().name}</>; }
/** Inline possessive: "<OrgPossessive /> board". */
export function OrgPossessive() { return <>{useOrg().possessive}</>; }
