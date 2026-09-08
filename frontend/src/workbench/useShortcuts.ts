import { useEffect } from 'react';

export type Shortcuts = Record<string, () => void>;

/**
 * Binds keyboard shortcuts at the document level.
 *
 * Keys are written as they are pressed: `'k'`, `'mod+k'`, `'ArrowLeft'`.
 * `mod` is Ctrl, or Cmd on a Mac — the app is Windows-only today, but writing
 * the check once costs nothing and avoids a shortcut that silently does not
 * work if that ever changes.
 *
 * A shortcut never fires while the user is typing. The note box is always
 * focused and always present, so a bare-letter shortcut that stole keystrokes
 * would make the note box unusable — and the note box is the feature the whole
 * anti-homework design rests on.
 */
export function useShortcuts(shortcuts: Shortcuts): void {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (isTyping(e.target)) return;

      const combo = [e.ctrlKey || e.metaKey ? 'mod' : '', e.shiftKey ? 'shift' : '', e.key]
        .filter(Boolean)
        .join('+');

      const handler = shortcuts[combo];
      if (handler) {
        // Only prevent the default for a combination actually bound. Swallowing
        // every keystroke would break find-in-page and text selection.
        e.preventDefault();
        handler();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [shortcuts]);
}

/** True when the event came from somewhere the user is entering text. */
function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}
