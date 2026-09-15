import type { ReactNode } from 'react';

import './shell.css';

export interface ContextRailProps {
  /** Names the region for a screen reader: "Material", "Sections". */
  label: string;
  /** Reading mode shuts it. */
  collapsed?: boolean;
  children: ReactNode;
}

/**
 * The 280px rail beside the main region: what belongs to the destination you
 * are in, such as the material tree in Files.
 *
 * Collapsing animates width rather than unmounting, so the rail keeps its
 * scroll position; while shut it is inert, so Tab cannot land inside a pane
 * that has no width.
 */
export function ContextRail({ label, collapsed = false, children }: ContextRailProps) {
  return (
    <aside
      className={collapsed ? 'sh-context sh-context-shut' : 'sh-context'}
      aria-label={label}
      aria-hidden={collapsed}
      inert={collapsed}
    >
      {children}
    </aside>
  );
}
