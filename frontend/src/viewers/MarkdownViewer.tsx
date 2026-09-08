import { useEffect, useMemo, useState } from 'react';

import { renderMarkdown } from './markdown';
import './markdown.css';

/**
 * The markdown viewer: preview, edit, or both side by side.
 *
 * Editing is withheld for the plan file, and only for the plan file. That file
 * changes through one path — a checkbox tick spliced byte-exactly (C3) —
 * because a full-file rewrite cannot promise that nothing else moved, and the
 * whole plan depends on nothing else moving. Every other markdown file is an
 * ordinary document the user owns and edits (Concept §7), with no such
 * constraint.
 *
 * The viewer does not decide which is which. `readOnly` comes from the
 * artifact, and the bridge refuses a plan-file write regardless — a UI flag
 * must not be the only thing protecting the file.
 */
export type Mode = 'preview' | 'edit' | 'split';

export interface MarkdownViewerProps {
  source: string;
  title: string;
  /** Withholds the editor and shows read-only source instead. */
  readOnly?: boolean;
  /** Absent means the file cannot be saved, which also withholds the editor. */
  onSave?: (content: string) => Promise<void>;
  initialMode?: Mode;
  /** Why editing is unavailable, shown in place of the editor. */
  readOnlyReason?: string;
  /**
   * Drives the mode from outside, and hides the viewer's own switch.
   *
   * The design canvas puts Edit/Split/Preview in the document header, beside
   * the title, rather than inside the document. Left uncontrolled the viewer
   * keeps its own bar, which is what its tests exercise and what any caller
   * without a header still gets.
   */
  mode?: Mode;
}

export function MarkdownViewer({
  source,
  title,
  readOnly = false,
  onSave,
  initialMode = 'preview',
  readOnlyReason,
  mode: controlledMode,
}: MarkdownViewerProps) {
  const editable = !readOnly && onSave !== undefined;

  const [ownMode, setMode] = useState<Mode>(initialMode);
  const mode = controlledMode ?? ownMode;
  const [draft, setDraft] = useState(source);
  const [activeSource, setActiveSource] = useState(source);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Opening a different file discards the previous draft rather than carrying
  // it across. Adjusting during render means the old text is never shown under
  // the new file's name.
  if (source !== activeSource) {
    setActiveSource(source);
    setDraft(source);
    setError(null);
  }

  const dirty = draft !== source;
  const html = useMemo(() => renderMarkdown(mode === 'preview' ? source : draft), [mode, source, draft]);

  // Unsaved work must not vanish silently when the window closes.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => {
      window.removeEventListener('beforeunload', warn);
    };
  }, [dirty]);

  async function save() {
    if (onSave === undefined || saving) return;
    setSaving(true);
    setError(null);
    try {
      await onSave(draft);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  const modes: Mode[] = editable ? ['preview', 'edit', 'split'] : ['preview', 'edit'];

  return (
    <div className="md">
      <div className="md-bar">
        {controlledMode === undefined &&
          modes.map((m) => (
            <button
              key={m}
              type="button"
              className={mode === m ? 'md-mode is-active' : 'md-mode'}
              aria-pressed={mode === m}
              onClick={() => {
                setMode(m);
              }}
            >
              {label(m, editable)}
            </button>
          ))}

        {editable && (
          <div className="md-save">
            {dirty && <span className="md-dirty">unsaved</span>}
            <button
              type="button"
              className="md-mode"
              disabled={!dirty || saving}
              onClick={() => {
                void save();
              }}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        )}
      </div>

      {error !== null && (
        <p className="md-error" role="alert">
          Could not save: {error}
        </p>
      )}

      <div className={`md-panes md-panes-${mode}`}>
        {mode !== 'edit' && (
          <article
            className="md-rendered"
            aria-label={`${title}, preview`}
            // Sanitised in renderMarkdown. The files are the user's own, but
            // rendering unsanitised HTML from any file is a habit worth not
            // forming.
            dangerouslySetInnerHTML={{ __html: html }}
          />
        )}

        {mode !== 'preview' &&
          (editable ? (
            <textarea
              className="md-editor"
              aria-label={`${title}, editor`}
              value={draft}
              spellCheck={false}
              onChange={(e) => {
                setDraft(e.target.value);
              }}
            />
          ) : (
            <div className="md-readonly">
              {readOnlyReason !== undefined && (
                <p className="md-readonly-note">{readOnlyReason}</p>
              )}
              <pre className="md-source" aria-label={`${title}, source`}>
                {source}
              </pre>
            </div>
          ))}
      </div>
    </div>
  );
}

function label(m: Mode, editable: boolean): string {
  if (m === 'preview') return 'Preview';
  if (m === 'split') return 'Split';
  // Calling a read-only pane "Edit" would promise something it does not do.
  return editable ? 'Edit' : 'Source';
}
