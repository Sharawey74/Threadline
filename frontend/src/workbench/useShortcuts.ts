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
 * A bare-letter shortcut never fires while the user is typing. The note box is
 * always present, so a shortcut that stole keystrokes would make it unusable —
 * and the note box is the feature the whole anti-homework design rests on.
 *
 * A combination with a modifier does fire, wherever the cursor is. `mod+k` in
 * a text box is not someone typing "k"; it is someone asking for the palette,
 * and being unreachable from the one field that is always focused would defeat
 * the reason the palette exists.
 */
export function useShortcuts(shortcuts: Shortcuts): void {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const modified = e.ctrlKey || e.metaKey;
      if (!modified && isTyping(e.target)) return;

      const combo = [modified ? 'mod' : '', e.shiftKey ? 'shift' : '', e.key]
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
