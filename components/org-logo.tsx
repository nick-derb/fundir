'use client';

import { useState } from 'react';

export function OrgLogo({ src, alt }: { src: string; alt: string }) {
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;
  return (
    <div className="org-logo-wrap">
      <img src={src} alt={alt} onError={() => setHidden(true)} />
    </div>
  );
}
