import { FileText, X } from 'lucide-react';
import type { MouseEvent } from 'react';

import type { Artifact } from '../ipc/types';
import './tabbar.css';

/**
 * The open documents.
 *
 * A tablist rather than a row of buttons, because that is what it is: arrow
 * keys move between tabs, and a screen reader announces "3 of 5" instead of
 * reading five unrelated buttons. Getting that from markup costs nothing;
 * getting it from a div soup afterwards costs a rewrite.
 */
export interface TabBarProps {
  open: Artifact[];
  activeId: number | null;
  onFocus: (id: number) => void;
  onClose: (id: number) => void;
}

export function TabBar({ open, activeId, onFocus, onClose }: TabBarProps) {
  if (open.length === 0) {
    // Not an error and not worth a message. An empty tab row is the ordinary
    // state before a document is opened, and a placeholder here would be one
    // more thing to read on every launch.
    return <div className="tb tb-empty" />;
  }

  return (
    <div className="tb" role="tablist" aria-label="Open documents">
      {open.map((a) => {
        const active = a.id === activeId;
        return (
          <div key={a.id} className={active ? 'tb-tab tb-tab-on' : 'tb-tab'}>
            <button
              type="button"
              role="tab"
              aria-selected={active}
              // Only the focused tab is in the tab order. Tab moves past the
              // whole row to the content; arrow keys move within it. Five open
              // documents should not mean five stops on the way to the page.
              tabIndex={active ? 0 : -1}
              className="tb-label"
              title={a.path}
              onClick={() => {
                onFocus(a.id);
              }}
              onAuxClick={(e: MouseEvent) => {
                // Middle-click closes, as it does in every editor and browser.
                if (e.button === 1) {
                  e.preventDefault();
                  onClose(a.id);
                }
              }}
            >
              <FileText className="tb-icon" aria-hidden="true" />
              <span className="tb-text">{a.title}</span>
            </button>

            <button
              type="button"
              className="tb-close"
              // The icon is decorative; the name has to say which document
              // this closes, or five close buttons all announce "Close".
              aria-label={`Close ${a.title}`}
              onClick={() => {
                onClose(a.id);
              }}
            >
              <X className="tb-icon" aria-hidden="true" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
