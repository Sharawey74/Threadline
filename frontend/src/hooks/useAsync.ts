import { useCallback, useEffect, useState } from 'react';

/**
 * The four states any bridge call can be in.
 *
 * A discriminated union rather than three loose booleans, because booleans
 * permit states that cannot happen — loading and error at once, data present
 * while still loading — and every component then has to decide what those mean.
 * Here the compiler makes each state handled exactly once.
 *
 * `empty` is separate from `ready` on purpose. "No material in this topic" and
 * "three PDFs" are different screens, and collapsing them is how a UI ends up
 * rendering a blank panel that looks broken.
 */
export type AsyncState<T> =
  | { status: 'loading' }
  | { status: 'error'; error: Error; retry: () => void }
  | { status: 'empty' }
  | { status: 'ready'; data: T };

/**
 * Runs an async function and tracks its state.
 *
 * `fn` is the cache key: the call re-runs when its identity changes, so callers
 * wrap it in `useCallback` with the real dependencies. That is why there is no
 * deps array here — one would duplicate `useCallback`'s, and the two would
 * eventually disagree.
 *
 *     const load = useCallback(() => ipc().getMaterial(topic), [topic]);
 *     const state = useAsync(load);
 *
 * The result of a superseded call is discarded. Without that, switching topics
 * quickly lets a slow first response land after a fast second one and overwrite
 * it — the classic race that shows the wrong topic's material.
 */
export function useAsync<T>(fn: () => Promise<T>): AsyncState<T> {
  const [state, setState] = useState<AsyncState<T>>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [activeFn, setActiveFn] = useState(() => fn);

  // Adjusting state during render is React's own pattern for resetting when an
  // input changes. It re-renders before anything is painted, so the stale data
  // is never shown — where a reset inside an effect would flash the previous
  // topic's material for a frame.
  if (fn !== activeFn) {
    setActiveFn(() => fn);
    setState({ status: 'loading' });
  }

  const retry = useCallback(() => {
    setAttempt((n) => n + 1);
  }, []);

  useEffect(() => {
    let live = true;

    fn().then(
      (data) => {
        if (!live) return;
        setState(isEmpty(data) ? { status: 'empty' } : { status: 'ready', data });
      },
      (err: unknown) => {
        if (!live) return;
        setState({ status: 'error', error: toError(err), retry });
      },
    );

    return () => {
      // The call is not cancellable — the bridge has no abort. What is
      // cancellable is caring about the answer.
      live = false;
    };
  }, [fn, attempt, retry]);

  return state;
}

/**
 * An array with nothing in it is empty; anything else is not.
 *
 * Deliberately not configurable. A caller needing different emptiness should
 * shape the data before handing it over, which keeps that decision visible at
 * the call site rather than hidden in an options bag.
 */
function isEmpty(data: unknown): boolean {
  return Array.isArray(data) && data.length === 0;
}

/** Rejections are not guaranteed to be Errors. Wrap rather than lose the reason. */
function toError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err));
}
