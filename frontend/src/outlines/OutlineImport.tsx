import { ChevronDown, ChevronUp, X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';

import { ipc } from '../ipc';
import type { Artifact, Outline } from '../ipc';
import './outlines.css';

export interface OutlineImportProps {
  artifact: Artifact;
  /** The outline being replaced, or an empty one for a first import. */
  initial: Outline;
  onSaved: () => void;
  onCancel: () => void;
}

interface Draft {
  key: number;
  title: string;
  /** As typed, so a half-edited number is not coerced on every keystroke. */
  page: string;
}

type Move = { key: number; dir: 'up' | 'down' };

let nextKey = 0;
function draft(title: string, page: number): Draft {
  nextKey += 1;
  return { key: nextKey, title, page: String(page) };
}

const whole = /^\d+$/;

/**
 * Screen 05: paste a table of contents on the left, check what was parsed on
 * the right, fix a page, reorder, save.
 *
 * There is no mode selector. The design offered "Trackable checklist", "Note
 * anchors only" and "Both"; every outline is both, so the choice is gone.
 *
 * Parsing happens in Go (`parseOutline`), the same rules the saved file is read
 * with, so what is shown here is what the file will hold. Reordering is by
 * buttons: a reorder that only works with a mouse drag is one a keyboard user
 * cannot do at all.
 */
export function OutlineImport({ artifact, initial, onSaved, onCancel }: OutlineImportProps) {
  const id = useId();
  const [text, setText] = useState('');
  const [rows, setRows] = useState<Draft[]>(() =>
    initial.sections.map((s) => draft(s.title, s.page)),
  );
  const [total, setTotal] = useState(initial.total > 0 ? String(initial.total) : '');
  const [announcement, setAnnouncement] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const parseSeq = useRef(0);
  const moveButtons = useRef(new Map<string, HTMLButtonElement>());
  const focusAfterMove = useRef<Move | null>(null);

  // Keep focus on the control that moved the row, so pressing it again keeps
  // moving the same section.
  useEffect(() => {
    const target = focusAfterMove.current;
    if (target === null) return;
    focusAfterMove.current = null;
    moveButtons.current.get(`${String(target.key)}-${target.dir}`)?.focus();
  });

  const onPaste = (value: string) => {
    setText(value);
    if (value.trim() === '') return;
    parseSeq.current += 1;
    const seq = parseSeq.current;
    ipc()
      .parseOutline(value)
      .then(
        (parsed) => {
          // A slower answer to older text must not overwrite a newer one.
          if (seq !== parseSeq.current) return;
          setRows(parsed.sections.map((s) => draft(s.title, s.page)));
          if (parsed.total > 0) setTotal(String(parsed.total));
          setError('');
        },
        (err: unknown) => {
          if (seq === parseSeq.current) setError(messageOf(err));
        },
      );
  };

  const move = (index: number, dir: 'up' | 'down') => {
    const to = dir === 'up' ? index - 1 : index + 1;
    if (to < 0 || to >= rows.length) return;
    const next = [...rows];
    const [row] = next.splice(index, 1);
    next.splice(to, 0, row);
    setRows(next);
    setAnnouncement(`${row.title} moved to position ${String(to + 1)} of ${String(next.length)}`);
    focusAfterMove.current = { key: row.key, dir };
  };

  const save = async () => {
    const bad = rows.find((r) => !whole.test(r.page.trim()));
    if (bad !== undefined) {
      setError(`${bad.title} needs a start page, as a whole number.`);
      return;
    }
    if (total.trim() !== '' && !whole.test(total.trim())) {
      setError('Total pages must be a whole number, or left empty.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await ipc().saveOutline(artifact.id, {
        total: total.trim() === '' ? 0 : Number(total),
        sections: rows.map((r, i) => ({
          title: r.title,
          page: Number(r.page),
          checked: false,
          lineNo: i + 1,
        })),
      });
      onSaved();
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setSaving(false);
    }
  };

  const editing = initial.sections.length > 0;

  return (
    <section className="oi" aria-labelledby={`${id}-title`}>
      <div className="oi-head">
        <h1 id={`${id}-title`} className="oi-title">
          {editing ? 'Edit outline' : 'Add outline'}: {artifact.title}
        </h1>
      </div>

      <div className="oi-panes">
        <div className="oi-pane">
          <label className="oi-label" htmlFor={`${id}-paste`}>
            Table of contents
          </label>
          <textarea
            id={`${id}-paste`}
            className="oi-paste"
            value={text}
            spellCheck={false}
            onChange={(e) => {
              onPaste(e.currentTarget.value);
            }}
          />
        </div>

        <div className="oi-pane">
          <h2 id={`${id}-parsed`} className="oi-label">
            Parsed sections
          </h2>
          <ol className="oi-rows" aria-labelledby={`${id}-parsed`}>
            {rows.map((r, i) => (
              <li key={r.key} className="oi-row">
                <span className="oi-row-title" title={r.title}>
                  {r.title}
                </span>
                <span className="oi-page">
                  <label htmlFor={`${id}-page-${String(r.key)}`}>
                    <span className="st-sr">Start page of {r.title}</span>
                    <span aria-hidden="true">p.</span>
                  </label>
                  <input
                    id={`${id}-page-${String(r.key)}`}
                    className="oi-num"
                    type="number"
                    min={0}
                    step={1}
                    inputMode="numeric"
                    value={r.page}
                    onChange={(e) => {
                      const page = e.currentTarget.value;
                      setRows((all) => all.map((x) => (x.key === r.key ? { ...x, page } : x)));
                    }}
                  />
                </span>
                <span className="oi-moves">
                  {(['up', 'down'] as const).map((dir) => {
                    const atEnd = dir === 'up' ? i === 0 : i === rows.length - 1;
                    const Icon = dir === 'up' ? ChevronUp : ChevronDown;
                    return (
                      <button
                        key={dir}
                        ref={(el) => {
                          const k = `${String(r.key)}-${dir}`;
                          if (el) moveButtons.current.set(k, el);
                          else moveButtons.current.delete(k);
                        }}
                        type="button"
                        className="oi-move"
                        aria-label={`Move ${r.title} ${dir}`}
                        aria-disabled={atEnd}
                        onClick={() => {
                          move(i, dir);
                        }}
                      >
                        <Icon aria-hidden="true" />
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    className="oi-move"
                    aria-label={`Remove ${r.title}`}
                    onClick={() => {
                      setRows((all) => all.filter((x) => x.key !== r.key));
                      setAnnouncement(`${r.title} removed`);
                    }}
                  >
                    <X aria-hidden="true" />
                  </button>
                </span>
              </li>
            ))}
          </ol>
          {rows.length === 0 && (
            <p className="oi-empty">
              Paste the contents page. Lines like “3. Indexes........ 47” become sections.
            </p>
          )}
        </div>
      </div>

      <div className="oi-foot">
        <label className="oi-label" htmlFor={`${id}-total`}>
          Total pages
        </label>
        <input
          id={`${id}-total`}
          className="oi-num"
          type="number"
          min={1}
          step={1}
          inputMode="numeric"
          value={total}
          aria-describedby={`${id}-total-hint`}
          onChange={(e) => {
            setTotal(e.currentTarget.value);
          }}
        />
        <span id={`${id}-total-hint`} className="oi-empty">
          Sets where the last section ends. Leave empty to count sections only.
        </span>
        <span className="sh-grow" />
        <button type="button" className="pr-quiet" onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className="btn-primary pr-open"
          disabled={saving || rows.length === 0}
          onClick={() => {
            void save();
          }}
        >
          Save outline
        </button>
        {error !== '' && (
          <p className="oi-error" role="alert">
            {error}
          </p>
        )}
      </div>

      <p className="st-sr" role="status" aria-live="polite">
        {announcement}
      </p>
    </section>
  );
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
