import type { HTMLAttributes, ReactNode } from 'react';

import './shell.css';

/**
 * The three surfaces every screen is built from.
 *
 * Thin on purpose: each is a class on the design tokens, so a destination
 * composes them rather than restyling a div, and the contrast audit in
 * theme.test.ts covers everything they can draw.
 */

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={className ? `sh-card ${className}` : 'sh-card'} {...rest} />;
}

export function Row({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={className ? `sh-row ${className}` : 'sh-row'} {...rest} />;
}

/**
 * A short label with a topic's hue. `topic` is 1-9, one of the nine topic
 * colours, and marks it on the pill's edge rather than filling it, so the text
 * stays on a surface the audit measured.
 */
export function Pill({ topic, children }: { topic?: number; children: ReactNode }) {
  const style =
    topic !== undefined && topic >= 1 && topic <= 9
      ? { borderColor: `var(--t${topic})` }
      : undefined;
  return (
    <span className="sh-pill" style={style}>
      {children}
    </span>
  );
}
