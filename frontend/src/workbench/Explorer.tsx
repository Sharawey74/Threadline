import { ChevronDown, ChevronRight, FileText, FileType, Search } from 'lucide-react';
import { useMemo, useState } from 'react';

import type { Artifact } from '../ipc/types';
import './explorer.css';

/**
 * The material rail.
 *
 * It used to be a flat list of one topic's files, which threw away the folder
 * structure the material already has on disk and made the topic selector the
 * only way to move between them. The folders are the curriculum: nine topics
 * the plan names in order, sitting in `Study guided & notes`. Showing them is
 * showing the plan.
 *
 * Counts are real — each is the length of a list that was actually read, never
 * a number from a field nothing populated (C5). That is why the whole tree
 * loads at once rather than lazily on expand: a folder that shows no count
 * until you open it is a folder you have to open to compare.
 */
export interface ExplorerProps {
  /** Every topic's material, keyed by topic slug, in curriculum order. */
  tree: { slug: string; files: Artifact[] }[];
  openIds: number[];
  activeId: number | null;
  onOpen: (artifact: Artifact) => void;
}

/** Extensions the viewer can render. Everything else is listed, not hidden. */
const OPENABLE = new Set(['.md', '.pdf']);

export function Explorer({ tree, openIds, activeId, onOpen }: ExplorerProps) {
  const [filter, setFilter] = useState('');
  const [shut, setShut] = useState<Set<string>>(new Set());

  const query = filter.trim().toLowerCase();

  const shown = useMemo(
    () =>
      tree
        .map((t) => ({
          ...t,
          files: query === '' ? t.files : t.files.filter((f) => f.title.toLowerCase().includes(query)),
        }))
        // While filtering, a topic with no match disappears rather than sitting
        // there empty. Ten headings over nothing is worse than a short list.
        .filter((t) => query === '' || t.files.length > 0),
    [tree, query],
  );

  return (
    <div className="ex">
      <div className="ex-filter">
        <Search className="ex-search-icon" aria-hidden="true" />
        <input
          type="search"
          className="ex-input"
          placeholder="Filter material"
          aria-label="Filter material"
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value);
          }}
        />
      </div>

      <div className="ex-tree">
        {shown.length === 0 && (
          <p className="ex-none">
            {query === '' ? 'No material found under the career folder.' : `Nothing matches “${filter}”.`}
          </p>
        )}

        {shown.map((topic) => {
          // A filter that hides the contents of the folder you are looking for
          // is a filter working against you, so matches always show expanded.
          const collapsed = query === '' && shut.has(topic.slug);
          return (
            <section key={topic.slug} className="ex-topic">
              <h3 className="ex-topic-head">
                <button
                  type="button"
                  className="ex-topic-btn"
                  aria-expanded={!collapsed}
                  // Named explicitly rather than left to the text nodes: an
                  // accessible name built by concatenation runs the count into
                  // the folder name - "System Design3".
                  aria-label={`${topic.slug}, ${
                    topic.files.length === 1 ? '1 file' : `${String(topic.files.length)} files`
                  }`}
                  onClick={() => {
                    setShut((prev) => {
                      const next = new Set(prev);
                      if (next.has(topic.slug)) next.delete(topic.slug);
                      else next.add(topic.slug);
                      return next;
                    });
                  }}
                >
                  {collapsed ? (
                    <ChevronRight className="ex-chev" aria-hidden="true" />
                  ) : (
                    <ChevronDown className="ex-chev" aria-hidden="true" />
                  )}
                  <span className="ex-topic-name">{topic.slug}</span>
                  {/*
                    The digit alone abuts the folder name in the accessibility
                    tree - "System Design3" - which reads as part of the name
                    rather than as a count. The number is shown; the phrase is
                    what gets announced.
                  */}
                  <span className="ex-count" aria-hidden="true">
                    {topic.files.length}
                  </span>
                </button>
              </h3>

              {!collapsed && (
                <ul className="ex-files">
                  {topic.files.map((f) => {
                    const openable = OPENABLE.has(f.ext.toLowerCase());
                    return (
                      <li key={f.id}>
                        <button
                          type="button"
                          className={
                            f.id === activeId
                              ? 'ex-file ex-file-on'
                              : openIds.includes(f.id)
                                ? 'ex-file ex-file-open'
                                : 'ex-file'
                          }
                          title={f.path}
                          disabled={!openable}
                          onClick={() => {
                            onOpen(f);
                          }}
                        >
                          {openable ? (
                            <FileText className="ex-file-icon" aria-hidden="true" />
                          ) : (
                            <FileType className="ex-file-icon" aria-hidden="true" />
                          )}
                          <span className="ex-file-name">{f.title}</span>
                          {/*
                            Office files and stray .html are on disk and the
                            viewer cannot render them (V0 scope). They are
                            listed anyway: a file the rail hides is a file you
                            go looking for in Explorer, which is one of the four
                            apps this replaces.
                          */}
                          {!openable && <span className="ex-ext">{f.ext.replace('.', '')}</span>}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
