import { useCallback, useState } from 'react';

import type { Artifact } from '../ipc/types';

/**
 * The open documents.
 *
 * Until now the workbench held one artifact and opening a second closed the
 * first, which makes the ordinary act of comparing two documents — a plan item
 * against the PDF it points at — into alt-tabbing inside the app that exists to
 * stop you alt-tabbing between apps.
 *
 * Identity is the artifact id, which is the store's stable handle: it survives
 * a rescan, so a tab does not detach from its document when a file is added to
 * a folder somewhere else.
 */
export interface Tabs {
  /** Open documents, in the order they were opened. */
  open: Artifact[];
  /** The focused document, or null when the checklist is showing. */
  active: Artifact | null;
  /** Open a document, or focus it if it is already open. */
  openTab: (artifact: Artifact) => void;
  /** Close one document and focus a neighbour. */
  closeTab: (id: number) => void;
  /** Focus an already-open document. */
  focusTab: (id: number) => void;
  /** Return to the checklist without closing anything. */
  blur: () => void;
}

export function useTabs(): Tabs {
  const [open, setOpen] = useState<Artifact[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);

  const openTab = useCallback((artifact: Artifact) => {
    // Opening something already open focuses it. Two tabs for one file would
    // let its scroll position and page differ between them, and the position
    // is stored per artifact, not per tab.
    setOpen((prev) => (prev.some((a) => a.id === artifact.id) ? prev : [...prev, artifact]));
    setActiveId(artifact.id);
  }, []);

  const closeTab = useCallback((id: number) => {
    setOpen((prev) => {
      const at = prev.findIndex((a) => a.id === id);
      if (at < 0) return prev;

      const next = prev.filter((a) => a.id !== id);

      setActiveId((current) => {
        // Closing a tab that was not focused must not move the focus.
        if (current !== id) return current;
        if (next.length === 0) return null;
        // Focus the neighbour to the right, which is the one that slides into
        // the closed tab's place. At the end of the row there is none, so take
        // the left. Anything else makes the focus jump across the bar.
        return (next[at] ?? next[next.length - 1]).id;
      });

      return next;
    });
  }, []);

  const focusTab = useCallback((id: number) => {
    setActiveId(id);
  }, []);

  const blur = useCallback(() => {
    setActiveId(null);
  }, []);

  return {
    open,
    active: open.find((a) => a.id === activeId) ?? null,
    openTab,
    closeTab,
    focusTab,
    blur,
  };
}
