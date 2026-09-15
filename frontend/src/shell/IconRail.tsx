import { FolderOpen, House, ListChecks, NotebookPen, Settings } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import './shell.css';

export type Destination = 'home' | 'files' | 'plan' | 'notes' | 'settings';

const DESTINATIONS: { id: Destination; label: string; Icon: LucideIcon }[] = [
  { id: 'home', label: 'Home', Icon: House },
  { id: 'files', label: 'Files', Icon: FolderOpen },
  { id: 'plan', label: 'Plan', Icon: ListChecks },
  { id: 'notes', label: 'Notes', Icon: NotebookPen },
  { id: 'settings', label: 'Settings', Icon: Settings },
];

export interface IconRailProps {
  active: Destination;
  onNavigate: (destination: Destination) => void;
}

/**
 * The five places the app has, always visible down the left edge.
 *
 * aria-current rather than aria-pressed or aria-selected: these are not
 * toggles and not tabs, they say where you are. A screen reader announces
 * "Plan, current page", which is the fact the highlight shows sighted users.
 */
export function IconRail({ active, onNavigate }: IconRailProps) {
  return (
    <nav className="sh-iconrail" aria-label="Destinations">
      {DESTINATIONS.map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          className="sh-dest"
          aria-current={id === active ? 'page' : undefined}
          onClick={() => {
            onNavigate(id);
          }}
        >
          <Icon className="sh-dest-icon" aria-hidden="true" />
          <span className="sh-dest-label">{label}</span>
        </button>
      ))}
    </nav>
  );
}
