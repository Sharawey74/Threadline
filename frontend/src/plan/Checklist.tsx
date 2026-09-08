import { useCallback, useMemo, useState } from 'react';

import type { Item } from '../ipc';
import './checklist.css';

/**
 * The checklist. Ticking a box here edits the real plan file.
 *
 * The tick is optimistic: the box flips immediately and reverts if the write
 * fails. That is the right trade for a local file write which either succeeds
 * in milliseconds or fails for a reason worth reading — waiting on a spinner
 * for a one-byte splice would make the app feel slower than the text editor it
 * replaces.
 *
 * Reverting is not enough on its own, though. A box that silently flips back
 * looks like a misclick, so a failure also surfaces the reason.
 *
 * Items are grouped by the plan's own sections, with the headings pinned. Flat,
 * the real file is 55 rows of similar-looking text and there is nothing to say
 * that "Notes track - 15h" belongs to September rather than to October. The
 * sections are how the plan is written; showing them is showing the plan.
 */
export interface ChecklistProps {
  items: Item[];
  onTick: (anchor: string, checked: boolean) => Promise<void>;
}

export function Checklist({ items, onTick }: ChecklistProps) {
  /** Anchors whose write is in flight, so a second click cannot race the first. */
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());
  /** Optimistic overrides, dropped once the source data catches up. */
  const [optimistic, setOptimistic] = useState<Record<string, boolean>>({});
  const [failure, setFailure] = useState<{
    anchor: string;
    message: string;
  } | null>(null);

  const handleTick = useCallback(
    async (item: Item, checked: boolean) => {
      if (pending.has(item.anchor)) return;

      setPending((p) => new Set(p).add(item.anchor));
      setOptimistic((o) => ({ ...o, [item.anchor]: checked }));
      setFailure(null);

      try {
        await onTick(item.anchor, checked);
      } catch (err) {
        // Put the box back and say why. A box that flips back without a
        // reason reads as a misclick, and the user tries again forever.
        setOptimistic((o) => {
          const next = { ...o };
          delete next[item.anchor];
          return next;
        });
        setFailure({
          anchor: item.anchor,
          message: err instanceof Error ? err.message : String(err),
        });
      } finally {
        setPending((p) => {
          const next = new Set(p);
          next.delete(item.anchor);
          return next;
        });
      }
    },
    [onTick, pending],
  );

  /*
   * Grouped in file order, not alphabetically or by role. The plan is a
   * document meant to be read top to bottom, and reordering its sections here
   * would make the checklist disagree with the file it writes to.
   */
  const sections = useMemo(() => {
    const byName = new Map<string, Item[]>();
    for (const item of items) {
      const group = byName.get(item.section);
      if (group) group.push(item);
      else byName.set(item.section, [item]);
    }
    return [...byName.entries()].map(([name, group]) => ({
      name,
      items: group,
    }));
  }, [items]);

  if (items.length === 0) {
    return <p className="cl-empty">No checklist items in this section.</p>;
  }

  return (
    <div className="cl">
      {sections.map((section) => (
        <section key={section.name} className="cl-section">
          <h3 className="cl-section-head">
            <span className="cl-section-name">{section.name}</span>
            <span className="cl-section-count" aria-hidden="true">
              {section.items.filter((i) => optimistic[i.anchor] ?? i.checked).length}/
              {section.items.length}
            </span>
          </h3>

          <ul className="cl-items" role="list">
            {section.items.map((item) => {
              const checked = optimistic[item.anchor] ?? item.checked;
              const busy = pending.has(item.anchor);
              const failed = failure?.anchor === item.anchor;

              return (
                <li key={item.anchor} className="cl-item">
                  <label className="cl-label">
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={busy}
                      onChange={(e) => {
                        void handleTick(item, e.target.checked);
                      }}
                    />
                    <span className={checked ? 'cl-text cl-text-done' : 'cl-text'}>
                      {item.text}
                    </span>
                    <Hours item={item} />
                  </label>

                  {failed && (
                    <p className="cl-error" role="alert">
                      Could not update the plan file: {failure.message}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

/**
 * An item's hours, rendered by how much the parser trusts the figure.
 *
 * Three states, and they must look different (C5):
 *   high  the author marked it up      -> shown plainly
 *   low   a bare figure, never marked  -> shown qualified
 *   none  the file never stated one    -> shown as nothing, not as 0h
 *
 * Rendering "0h" for an item with no hours is how a budget silently loses
 * time, which is the failure the whole role model exists to prevent.
 */
function Hours({ item }: { item: Item }) {
  if (item.hoursConf === 'none') {
    return <span className="cl-hours cl-hours-unstated">no estimate</span>;
  }
  if (item.hoursConf === 'low') {
    return (
      <span className="cl-hours cl-hours-low" title={item.notes.join('\n')}>
        ~{item.hours}h<span aria-hidden="true">?</span>
        <span className="cl-sr">, unconfirmed estimate</span>
      </span>
    );
  }
  return <span className="cl-hours">{item.hours}h</span>;
}
