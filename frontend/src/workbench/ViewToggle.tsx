import { Columns2, Eye, PencilLine } from 'lucide-react';

import './viewtoggle.css';

/** How a markdown document is shown. F6 in Build-Plan §3.1. */
export type ViewMode = 'edit' | 'split' | 'preview';

/**
 * Edit · Split · Preview.
 *
 * The plan file is preview-only and the control says so rather than going
 * quietly dead. A disabled button with no explanation reads as a bug, and this
 * one is the visible face of C3 — the plan file changes by ticking a checkbox
 * and by nothing else, because a full-file rewrite cannot promise that nothing
 * else moved. The bridge refuses the write regardless of what this shows.
 */
export interface ViewToggleProps {
  mode: ViewMode;
  onChange: (mode: ViewMode) => void;
  /** Set for the plan file: edit and split are withheld, with the reason. */
  readOnlyReason?: string;
}

const MODES: { id: ViewMode; label: string; Icon: typeof Eye }[] = [
  { id: 'edit', label: 'Edit', Icon: PencilLine },
  { id: 'split', label: 'Split', Icon: Columns2 },
  { id: 'preview', label: 'Preview', Icon: Eye },
];

export function ViewToggle({ mode, onChange, readOnlyReason }: ViewToggleProps) {
  const locked = readOnlyReason !== undefined && readOnlyReason !== '';

  return (
    <div className="vt" role="group" aria-label="View mode">
      {MODES.map(({ id, label, Icon }) => {
        const withheld = locked && id !== 'preview';
        return (
          <button
            key={id}
            type="button"
            className={mode === id ? 'vt-btn vt-btn-on' : 'vt-btn'}
            aria-pressed={mode === id}
            disabled={withheld}
            // The reason travels with the control. Someone who tabs onto a
            // withheld button hears why it is withheld, rather than only that
            // it is unavailable.
            title={withheld ? readOnlyReason : label}
            aria-description={withheld ? readOnlyReason : undefined}
            onClick={() => {
              onChange(id);
            }}
          >
            <Icon className="vt-icon" aria-hidden="true" />
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}
