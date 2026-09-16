import type { Artifact, OutlineView } from '../ipc';
import { Pill } from '../shell/Surfaces';
import './outlines.css';

export interface PdfRecordProps {
  artifact: Artifact;
  view: OutlineView;
  /** Opens the PDF in Edge; 0 opens it at the start. */
  onOpen: (page: number) => void;
  /** Ticks a section, named by its position in the outline. */
  onTick: (index: number, checked: boolean) => void;
  onAddOutline: () => void;
  /** Sections whose write is in flight. */
  pending?: ReadonlySet<number>;
}

/**
 * One PDF's record: its outline as progress, and the hand-off to Edge.
 *
 * Threadline renders no PDF. Every figure here is one the outline file holds
 * or the user entered: sections ticked, the pages their ranges cover, the page
 * total. No percentage, and no page figure at all without a total (C5).
 *
 * NEXT is the first unticked section, derived on every render. The design
 * called it CURRENT BOOKMARK, which implies something stored; nothing is.
 */
export function PdfRecord({
  artifact,
  view,
  onOpen,
  onTick,
  onAddOutline,
  pending = new Set(),
}: PdfRecordProps) {
  const { outline, progress } = view;
  const nextIndex = outline.sections.findIndex((s) => !s.checked);
  const next = nextIndex >= 0 ? outline.sections[nextIndex] : undefined;
  const topic = topicOf(artifact.path);

  return (
    <article className="pr" aria-labelledby="pr-title">
      <header
        className="pr-hero"
        style={topic.hue ? { borderLeftColor: `var(--t${String(topic.hue)})` } : undefined}
      >
        {topic.name !== '' && <Pill topic={topic.hue}>{topic.name}</Pill>}
        <h1 id="pr-title" className="pr-title">
          {artifact.title}
        </h1>
        <div className="pr-actions">
          <button
            type="button"
            className="btn-primary pr-open"
            onClick={() => {
              onOpen(next?.page ?? 0);
            }}
          >
            {next ? `Open in Edge at page ${String(next.page)}` : 'Open in Edge'}
          </button>
          {view.exists && (
            <p className="pr-counts">
              <span>
                {progress.sectionsDone} of {progress.sections} sections
              </span>
              {progress.pagesKnown && (
                <span>
                  {progress.pagesDone} of {progress.pages} pages
                </span>
              )}
            </p>
          )}
        </div>
      </header>

      {view.exists ? (
        <section className="pr-outline" aria-labelledby="pr-outline-title">
          <div className="pr-band">
            <h2 id="pr-outline-title" className="pr-h2">
              Outline
            </h2>
            <button type="button" className="pr-quiet" onClick={onAddOutline}>
              Edit outline
            </button>
          </div>
          <ol className="pr-secs">
            {outline.sections.map((s, i) => (
              <li
                key={`${String(i)}-${s.title}`}
                className={s.checked ? 'pr-sec pr-sec-done' : 'pr-sec'}
              >
                <label className="pr-sec-label">
                  <input
                    type="checkbox"
                    checked={s.checked}
                    disabled={pending.has(i)}
                    onChange={(e) => {
                      onTick(i, e.currentTarget.checked);
                    }}
                  />
                  <span className="pr-sec-title">{s.title}</span>
                </label>
                {i === nextIndex && <span className="pr-next">NEXT</span>}
                <span className="pr-page">p.{s.page}</span>
              </li>
            ))}
          </ol>
        </section>
      ) : (
        <section className="pr-invite" aria-labelledby="pr-invite-title">
          <h2 id="pr-invite-title" className="pr-h2">
            No outline yet
          </h2>
          <p className="pr-hint">
            Paste this PDF&apos;s table of contents to tick sections as you finish them. Without
            one, the file still opens in Edge; it just is not tracked.
          </p>
          <button type="button" className="pr-add" onClick={onAddOutline}>
            Add outline
          </button>
        </section>
      )}
    </article>
  );
}

/**
 * The topic folder a file sits in, and its hue when the folder is numbered
 * 1 to 9: "…/06 - System Design/x.pdf" is topic 6.
 */
function topicOf(path: string): { name: string; hue?: number } {
  const parts = path.split('/');
  const name = parts.length >= 2 ? parts[parts.length - 2] : '';
  const n = Number(/^(\d+)\s*-/.exec(name)?.[1]);
  return { name, hue: n >= 1 && n <= 9 ? n : undefined };
}
