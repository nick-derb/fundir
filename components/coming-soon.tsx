// Placeholder for nav destinations in the new dashboard IA that haven't been
// designed in Claude Design yet (Prospecting, Cultivation List, Connections,
// Applications). Held intentionally blank-but-tidy until the design lands, then
// each becomes a real page. Server component.

import { Compass } from 'lucide-react';

export function ComingSoon({ title, blurb }: { title: string; blurb?: string }) {
  return (
    <div className="px-4 sm:px-6 md:px-8 py-6 max-w-7xl mx-auto">
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="w-11 h-11 rounded-sm border border-hairline bg-surface flex items-center justify-center mx-auto mb-5">
            <Compass className="w-4 h-4 text-accent" />
          </div>
          <p className="text-eyebrow uppercase text-accent mb-2">In design</p>
          <h1 className="text-h1 text-primary mb-2">{title}</h1>
          <p className="text-body text-muted leading-relaxed">
            {blurb ?? 'This section is being designed. It will light up here as soon as it’s ready.'}
          </p>
        </div>
      </div>
    </div>
  );
}
