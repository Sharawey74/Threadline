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
