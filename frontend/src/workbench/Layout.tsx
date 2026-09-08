import type { ReactNode } from 'react';

import './layout.css';

/**
 * The workbench shell: the frame that replaces four applications.
 *
 * It takes its regions as props rather than fetching anything. That keeps the
 * layout testable on its own, and means a region can be swapped - a PDF viewer
 * for a markdown one - without the frame knowing which it is holding.
 *
 * The regions come straight from Concept §6.2:
 *
 *   ┌───────────────────────────────────────────────┐
 *   │ header: what is open                          │
 *   ├────────────┬──────────────────────────────────┤
 *   │ rail       │ viewer                           │
 *   │ material   │                                  │
 *   │ progress   │                                  │
 *   │ session    │                                  │
 *   │ note       │                                  │
 *   └────────────┴──────────────────────────────────┘
 *
 * The note box lives in the frame, always visible, never a popup. That is a
 * product decision, not a layout one: a note you have to summon is a note that
 * does not get written, and the app's named failure mode is becoming homework.
 */
export interface LayoutProps {
  header: ReactNode;
  material: ReactNode;
  progress: ReactNode;
  session: ReactNode;
  note: ReactNode;
  viewer: ReactNode;
}

export function Layout({
  header,
  material,
  progress,
  session,
  note,
  viewer,
}: LayoutProps) {
  return (
    <div className="wb">
      <header className="wb-header">{header}</header>

      {/* The rail is one scroll container so a long material list cannot push
          the note box off screen - the note must always be reachable. */}
      <div className="wb-rail">
        <Region label="Material" className="wb-rail-material">
          {material}
        </Region>
        <Region label="Topic">{progress}</Region>
        <Region label="Session">{session}</Region>
        <div className="wb-rail-note">{note}</div>
      </div>

      <main className="wb-viewer" aria-label="Viewer">
        {viewer}
      </main>
    </div>
  );
}

interface RegionProps {
  label: string;
  className?: string;
  children: ReactNode;
}

/**
 * A titled block in the rail.
 *
 * The label is a real heading rather than styled text, so the rail is
 * navigable by screen reader and by heading-jump shortcuts.
 */
function Region({ label, className, children }: RegionProps) {
  return (
    <section className={className ? `wb-region ${className}` : 'wb-region'}>
      <h2 className="wb-region-label">{label}</h2>
      {children}
    </section>
  );
}
