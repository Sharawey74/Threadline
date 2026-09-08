import * as Dialog from '@radix-ui/react-dialog';
import { Command } from 'cmdk';
import { useState } from 'react';

import type { Artifact } from '../ipc/types';
import './palette.css';

/**
 * Ctrl+K.
 *
 * The shortcuts already existed and nothing on screen mentioned them, which
 * makes them secret rather than fast. This is where they become findable: one
 * key, type what you want, Enter.
 *
 * Radix carries the parts that are easy to get subtly wrong and invisible when
 * you do — the focus trap, Escape, returning focus to whatever had it before,
 * and marking the rest of the app inert while the dialog is up. cmdk carries
 * the combobox semantics: arrow keys, aria-activedescendant, and a filtered
 * list that announces its result count. Both were the argument for ADR-003.
 */
export interface PaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Everything openable, flattened out of the rail's tree. */
  files: Artifact[];
  onOpenFile: (artifact: Artifact) => void;
  actions: { id: string; label: string; hint?: string; run: () => void }[];
}

export function Palette({ open, onOpenChange, files, onOpenFile, actions }: PaletteProps) {
  const [query, setQuery] = useState('');

  /*
   * The query is cleared as the dialog closes, in the handler that closes it.
   *
   * An effect watching `open` would do the same thing one render later, which
   * is the cascading-render pattern the linter rejects - and it would clear on
   * mount too, for a dialog that has never been opened. Closing is an event;
   * this is where it belongs.
   */
  const close = (next: boolean) => {
    if (!next) setQuery('');
    onOpenChange(next);
  };

  const run = (fn: () => void) => {
    close(false);
    fn();
  };

  return (
    <Dialog.Root open={open} onOpenChange={close}>
      <Dialog.Portal>
        <Dialog.Overlay className="pl-overlay" />
        <Dialog.Content className="pl" aria-describedby={undefined}>
          <Dialog.Title className="pl-sr">Command palette</Dialog.Title>

          <Command label="Command palette" shouldFilter>
            <Command.Input
              className="pl-input"
              placeholder="Open a document, or run a command"
              value={query}
              onValueChange={setQuery}
              autoFocus
            />

            <Command.List className="pl-list">
              {/* cmdk announces this to a screen reader, so an empty result is
                  heard rather than only seen. */}
              <Command.Empty className="pl-empty">Nothing matches “{query}”.</Command.Empty>

              <Command.Group heading="Commands" className="pl-group">
                {actions.map((a) => (
                  <Command.Item
                    key={a.id}
                    className="pl-item"
                    // Documents and commands can share a word - "theme" could
                    // be both - so the value is namespaced to keep one from
                    // shadowing the other in the filter.
                    value={`command ${a.label}`}
                    onSelect={() => {
                      run(a.run);
                    }}
                  >
                    <span>{a.label}</span>
                    {a.hint !== undefined && <kbd className="pl-kbd">{a.hint}</kbd>}
                  </Command.Item>
                ))}
              </Command.Group>

              <Command.Group heading="Documents" className="pl-group">
                {files.map((f) => (
                  <Command.Item
                    key={f.id}
                    className="pl-item"
                    // The path is in the value so typing a folder name finds
                    // everything under it, not just files named after it.
                    value={`file ${f.title} ${f.path}`}
                    onSelect={() => {
                      run(() => {
                        onOpenFile(f);
                      });
                    }}
                  >
                    <span>{f.title}</span>
                    <span className="pl-path">{f.path}</span>
                  </Command.Item>
                ))}
              </Command.Group>
            </Command.List>
          </Command>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
