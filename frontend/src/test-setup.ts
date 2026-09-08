import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach } from 'vitest';

// Testing Library registers its own cleanup only when vitest runs with
// globals enabled. This project keeps globals off - every import explicit - so
// the cleanup is wired here instead.
//
// Without it, each render stacks another copy of the component in the same
// document and queries start finding several matches. That surfaces as
// "found multiple elements", which reads like a component bug and is not one.
afterEach(cleanup);

/**
 * A deterministic in-memory localStorage.
 *
 * jsdom's own implementation varies by version and persists between tests in
 * the same file, so a test that writes a preference can change the outcome of
 * the next one. This replaces it with something explicit, reset before every
 * test, and easy to make throw when a test needs the storage-unavailable path.
 */
class MemoryStorage implements Storage {
  private store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.store.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
}

beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', {
    value: new MemoryStorage(),
    configurable: true,
    writable: true,
  });
});

/**
 * A ResizeObserver that observes nothing.
 *
 * jsdom does not implement one, and the PDF viewer uses it to fit a page to
 * the width it has. Under jsdom every element measures zero anyway, so a real
 * implementation would add no coverage — what the tests need is for the
 * constructor to exist so the component mounts. The viewer falls back to the
 * page's intrinsic width when it has measured nothing, which is the path these
 * tests exercise.
 */
class NullResizeObserver implements ResizeObserver {
  observe(): void {
    /* nothing to measure under jsdom */
  }

  unobserve(): void {
    /* nothing to measure under jsdom */
  }

  disconnect(): void {
    /* nothing to measure under jsdom */
  }
}

globalThis.ResizeObserver = NullResizeObserver;

/**
 * scrollIntoView, which jsdom does not implement.
 *
 * The command palette keeps the arrow-key selection in view as it moves, so
 * every interaction with it calls this. There is no layout under jsdom for it
 * to affect, and the behaviour it stands in for - is the selected row visible -
 * is not something these tests can observe anyway.
 */
Element.prototype.scrollIntoView = function scrollIntoView() {
  /* no layout under jsdom */
};
