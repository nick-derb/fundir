/**
 * <Card> — default container.
 *
 * DESIGN_SYSTEM.md §2.1. White (`canvas-1`), 10px radius, flat shadow
 * (1px border via shadow), 20px padding. Borderless when nested inside
 * another Card; bordered when freestanding. Use Card.Header, Card.Section,
 * and Card.Empty to compose without writing layout CSS at the call site.
 */

import * as React from 'react';
import clsx from 'clsx';

type CardProps = React.HTMLAttributes<HTMLDivElement> & {
  /** Removes the flat-shadow border. Use when nested inside another Card. */
  nested?: boolean;
  /** Renders the lift shadow instead of flat. */
  raised?: boolean;
};

function CardRoot({ nested, raised, className, ...rest }: CardProps) {
  return (
    <div
      className={clsx(
        'bg-canvas-1 rounded-lg p-5',
        !nested && (raised ? 'shadow-lift' : 'shadow-flat'),
        className,
      )}
      {...rest}
    />
  );
}

interface CardHeaderProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  eyebrow?: React.ReactNode;
  title:    React.ReactNode;
  /** Right-aligned action slot (button, badge, etc). */
  actions?: React.ReactNode;
}

function CardHeader({ eyebrow, title, actions, className, ...rest }: CardHeaderProps) {
  return (
    <div className={clsx('flex items-start justify-between gap-3 mb-3', className)} {...rest}>
      <div className="min-w-0">
        {eyebrow != null && (
          <div className="text-eyebrow uppercase font-semibold text-ink-2 mb-1">
            {eyebrow}
          </div>
        )}
        <div className="text-h2 font-semibold text-ink-0 truncate">{title}</div>
      </div>
      {actions && <div className="shrink-0 flex items-center gap-2">{actions}</div>}
    </div>
  );
}

function CardSection({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={clsx('mt-4 pt-4 border-t border-canvas-3', className)}
      {...rest}
    />
  );
}

interface CardEmptyProps {
  icon?: React.ReactNode;
  title: string;
  body?: string;
  cta?:  React.ReactNode;
}

function CardEmpty({ icon, title, body, cta }: CardEmptyProps) {
  return (
    <div className="flex flex-col items-center text-center py-10 px-4">
      {icon && <div className="text-ink-2 mb-3">{icon}</div>}
      <div className="text-h2 font-semibold text-ink-0 mb-1">{title}</div>
      {body && <div className="text-body text-ink-1 max-w-md mb-4">{body}</div>}
      {cta}
    </div>
  );
}

export const Card = Object.assign(CardRoot, {
  Header:  CardHeader,
  Section: CardSection,
  Empty:   CardEmpty,
});
