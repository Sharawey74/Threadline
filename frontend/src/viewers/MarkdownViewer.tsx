import { useMemo, useState } from 'react';

import { renderMarkdown } from './markdown';
import './markdown.css';

/**
 * The markdown viewer: rendered, source, or both side by side.
 *
 * The third mode is **source**, not edit — a deliberate departure from
 * Build-Plan F6, which says "preview / edit / split".
 *
 * V0 makes exactly one write: a checkbox tick, through the byte-exact path
 * (C3). There is no save path for arbitrary markdown, so an edit mode would
 * either violate C3 or silently discard whatever the user typed. Discarding
 * work is worse than not offering the box — and this app's whole premise is
 * that the user's files are safe in it. Read-only source keeps the useful half
 * of that mode (seeing what the parser sees) without the dishonest half.
 *
 * Recorded in Build-Plan §3.1 alongside F6.
 */
export type Mode = 'rendered' | 'source' | 'split';

export interface MarkdownViewerProps {
  source: string;
  title: string;
  initialMode?: Mode;
}

export function MarkdownViewer({ source, title, initialMode = 'rendered' }: MarkdownViewerProps) {
  const [mode, setMode] = useState<Mode>(initialMode);

  const html = useMemo(() => renderMarkdown(source), [source]);

  return (
    <div className="md">
      <div className="md-bar" role="group" aria-label="View mode">
        {(['rendered', 'source', 'split'] as const).map((m) => (
          <button
            key={m}
            type="button"
            className={mode === m ? 'md-mode is-active' : 'md-mode'}
            aria-pressed={mode === m}
            onClick={() => {
              setMode(m);
            }}
          >
            {m === 'rendered' ? 'Rendered' : m === 'source' ? 'Source' : 'Split'}
          </button>
        ))}
      </div>

      <div className={`md-panes md-panes-${mode}`}>
        {mode !== 'source' && (
          <article
            className="md-rendered"
            aria-label={`${title}, rendered`}
            // Sanitised immediately above. The content is the user's own local
            // file, but rendering unsanitised HTML from any file is a habit
            // worth not forming.
            dangerouslySetInnerHTML={{ __html: html }}
          />
        )}
        {mode !== 'rendered' && (
          <pre className="md-source" aria-label={`${title}, source`}>
            {source}
          </pre>
        )}
      </div>
    </div>
  );
}
