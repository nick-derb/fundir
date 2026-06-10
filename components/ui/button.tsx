/**
 * <Button> — four variants, no surprises.
 *
 * DESIGN_SYSTEM.md §2.10. Primary fills with --action; one per surface.
 * Secondary is canvas-2 fill. Ghost is transparent + underline on hover.
 * Link is inline text.
 */

import * as React from 'react';
import clsx from 'clsx';

type Variant = 'primary' | 'secondary' | 'ghost' | 'link';
type Size    = 'sm' | 'md';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?:    Size;
}

const BASE = 'inline-flex items-center justify-center gap-1.5 rounded-md font-semibold transition-colors duration-fast focus:outline-none focus:ring-2 focus:ring-focus focus:ring-offset-2 focus:ring-offset-canvas-0 disabled:opacity-50 disabled:cursor-not-allowed';

const VARIANT: Record<Variant, string> = {
  primary:   'bg-action text-canvas-1 hover:bg-action-hover',
  secondary: 'bg-canvas-2 text-ink-0 hover:bg-canvas-3',
  ghost:     'bg-transparent text-ink-0 hover:underline',
  link:      'bg-transparent text-action hover:text-action-hover hover:underline p-0 h-auto',
};

const SIZE: Record<Size, string> = {
  sm: 'h-8 px-3 text-body',
  md: 'h-10 px-4 text-body',
};

export function Button({ variant = 'primary', size = 'md', className, ...rest }: ButtonProps) {
  return (
    <button
      className={clsx(BASE, VARIANT[variant], variant !== 'link' && SIZE[size], className)}
      {...rest}
    />
  );
}
