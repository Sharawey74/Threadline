import { act } from '@testing-library/react';

/*
 * Helpers for absence tests: "X never appears", "no alert", "no mode
 * selector". An absence has no natural edge, so each of these tests should do
 * all three things below, never one of them:
 *
 *   1. render every state the component has, and check readable() in each;
 *   2. call settled() before any negative assertion that follows an action;
 *   3. scan the folder's source with foldSource(), for states not rendered.
 *
 * List the states from the component's code (every branch that renders
 * something), not from the design.
 */

/** Non-breaking spaces read as spaces, so "CURRENT&nbsp;BOOKMARK" still matches. */
function normalise(text: string): string {
  return text.replace(/\u00a0/g, ' ');
}

/**
 * Everything a person could read or hear, as separate strings: each element's
 * own text, its naming attributes, and the text its aria-labelledby points at.
 * Per element, because the body's whole textContent runs neighbours together
 * ("pagesOutline") and word boundaries vanish.
 */
export function readable(root: ParentNode = document.body): string[] {
  const out: string[] = [];
  for (const el of root.querySelectorAll('*')) {
    out.push(el.textContent ?? '');
    for (const attr of ['aria-label', 'title', 'placeholder', 'value', 'alt', 'aria-valuetext']) {
      const value = el.getAttribute(attr);
      if (value !== null) out.push(value);
    }
    for (const ref of (el.getAttribute('aria-labelledby') ?? '').split(/\s+/)) {
      if (ref !== '') out.push(document.getElementById(ref)?.textContent ?? '');
    }
  }
  return out.map(normalise);
}

/**
 * Source text as it reads, not as it is laid out: comments removed, JSX
 * spacing ({' '} or {" "}) and &nbsp; made plain spaces, whitespace runs
 * folded, lower-cased. A label wrapped over two JSX lines reads whole.
 */
export function foldSource(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[\s;{}(),])\/\/.*$/gm, '$1')
    .replace(/\{\s*(['"])\s\1\s*\}/g, ' ')
    .replace(/&nbsp;|\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

/**
 * Which files contain which needles, after foldSource(). Strings match
 * case-insensitively; regular expressions match as written against the
 * folded, lower-cased text.
 */
export function sourceHits(
  sources: Record<string, string>,
  needles: readonly (string | RegExp)[],
): string[] {
  const hits: string[] = [];
  for (const [file, source] of Object.entries(sources)) {
    const code = foldSource(source);
    for (const needle of needles) {
      const found =
        typeof needle === 'string' ? code.includes(needle.toLowerCase()) : needle.test(code);
      if (found) hits.push(`${String(needle)} in ${file}`);
    }
  }
  return hits;
}

interface Spy {
  mock: { results: { value: unknown }[] };
}

/**
 * Waits until every call the spies have seen has settled, including calls
 * those calls set off, and React has rendered the result. A negative
 * assertion made before this is made while the cause may still be in flight.
 */
export async function settled(...spies: Spy[]): Promise<void> {
  let seen = -1;
  for (;;) {
    const pending = spies.flatMap((s) => s.mock.results.map((r) => r.value));
    if (pending.length === seen) return;
    seen = pending.length;
    await act(async () => {
      await Promise.allSettled(pending);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}
