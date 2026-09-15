import type { ReactNode } from 'react';

import './shell.css';

export interface ShellProps {
  title: ReactNode;
  rail: ReactNode;
  /** The destination's own rail, beside the main region. Absent for most. */
  context?: ReactNode;
  /** Names the main region for a screen reader: the destination's name. */
  label: string;
  children: ReactNode;
  status: ReactNode;
}

/**
 * The frame every screen sits in.
 *
 *   ┌───────────────────────────────────────────────┐
 *   │ title bar                                  44 │
 *   ├──────┬──────────────┬─────────────────────────┤
 *   │ icon │ context rail │ main                    │
 *   │ 72   │ 280, if any  │                         │
 *   ├──────┴──────────────┴─────────────────────────┤
 *   │ status                                     32 │
 *   └───────────────────────────────────────────────┘
 *
 * It fetches nothing and knows no destination, so a screen is whatever is
 * passed in and the frame is testable on its own.
 */
export function Shell({ title, rail, context, label, children, status }: ShellProps) {
  return (
    <div className="sh">
      {title}
      <div className="sh-body">
        {rail}
        {context}
        <main className="sh-main" aria-label={label}>
          {children}
        </main>
      </div>
      <div className="sh-status">{status}</div>
    </div>
  );
}
