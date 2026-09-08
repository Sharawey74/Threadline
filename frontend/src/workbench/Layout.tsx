import type { ReactNode } from 'react';

import './layout.css';

/**
 * The workbench shell: the frame that replaces four applications.
 *
 * It takes its regions as props and fetches nothing, so the frame stays
 * testable on its own and a region can be swapped — a PDF viewer for a
 * markdown one — without the frame knowing which it holds.
 *
 *   ┌──────────────────────────────────────────────────────┐
 *   │ title      36  app, career root, view switch, window │
 *   ├──────────────────────────────────────────────────────┤
 *   │ tabs       40  the open documents                    │
 *   ├──────────────────────────────────────────────────────┤
 *   │ document   52  what is open, and Edit/Split/Preview   │
 *   ├─────────┬───────────────────────────┬────────────────┤
 *   │ rail    │ viewer                    │ plan           │
 *   │ 300     │                           │ 400            │
 *   ├─────────┴───────────────────────────┴────────────────┤
 *   │ status     32  saved, position, reconciliation       │
 *   └──────────────────────────────────────────────────────┘
 *
 * Two decisions worth stating, because both were different a version ago:
 *
 * **The plan is a pane, not a destination.** It used to replace the viewer,
 * so reading a PDF and ticking the item it belongs to were mutually exclusive.
 * Doing both at once is the entire product; making them alternate rebuilt the
 * problem the app exists to solve, one level down.
 *
 * **Both side panes collapse to nothing.** Reading is what the window is for,
 * and on a 1280px screen the chrome takes half of it. Collapsing is a width
 * transition rather than an unmount so the panes keep their scroll position —
 * coming back to a rail scrolled somewhere else would make it a worse trade
 * than leaving them open.
 */
export interface LayoutProps {
  title: ReactNode;
  tabs: ReactNode;
  document: ReactNode;
  rail: ReactNode;
  viewer: ReactNode;
  plan: ReactNode;
  status: ReactNode;
  /** Reading mode collapses the rail. */
  railCollapsed?: boolean;
  /** Reading mode collapses the plan pane. */
  planCollapsed?: boolean;
}

export function Layout({
  title,
  tabs,
  document,
  rail,
  viewer,
  plan,
  status,
  railCollapsed = false,
  planCollapsed = false,
}: LayoutProps) {
  return (
    <div className="wb">
      <div className="wb-title">{title}</div>
      <div className="wb-tabs">{tabs}</div>
      <div className="wb-dochead">{document}</div>

      <div className="wb-body">
        {/*
          aria-hidden while collapsed, and inert so nothing inside can take
          focus: a pane animated to zero width is still in the tab order
          otherwise, and Tab appears to jump into nothing.
        */}
        <aside
          className={railCollapsed ? 'wb-rail wb-rail-shut' : 'wb-rail'}
          aria-label="Material"
          aria-hidden={railCollapsed}
          inert={railCollapsed}
        >
          {rail}
        </aside>

        <main className="wb-viewer" aria-label="Viewer">
          {viewer}
        </main>

        <aside
          className={planCollapsed ? 'wb-plan wb-plan-shut' : 'wb-plan'}
          aria-label="Plan"
          aria-hidden={planCollapsed}
          inert={planCollapsed}
        >
          {plan}
        </aside>
      </div>

      <div className="wb-status">{status}</div>
    </div>
  );
}
