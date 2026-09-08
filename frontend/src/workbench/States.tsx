import type { ReactNode } from 'react';

import type { AsyncState } from '../hooks/useAsync';
import './states.css';

/**
 * The states every pane can be in, designed once and shared.
 *
 * I3 requires that every empty, loading and error state is designed and none
 * left default. Centralising them is how that stays true: a new pane gets the
 * designed states by construction rather than by the author remembering.
 */

export function Loading({ label }: { label: string }) {
  return (
    <div className="st" role="status" aria-live="polite">
      <p className="st-text">{label}</p>
    </div>
  );
}

/**
 * An error a person can act on.
 *
 * The message is shown rather than hidden behind "something went wrong". The
 * backend returns messages written for a human to read — "plan file changed on
 * disk since it was read" tells you to re-scan; "something went wrong" tells
 * you nothing and trains you to ignore errors.
 */
export function Failed({
  title,
  error,
  onRetry,
}: {
  title: string;
  error: Error;
  onRetry?: () => void;
}) {
  return (
    <div className="st st-failed" role="alert">
      <p className="st-title">{title}</p>
      <p className="st-detail">{error.message}</p>
      {onRetry && (
        <button type="button" className="st-action" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

/**
 * An empty state that says why it is empty and what would fill it.
 *
 * A blank panel reads as a broken app. Saying "no material in this topic yet"
 * is the difference between the user believing the app works and believing it
 * failed silently.
 */
export function Empty({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="st">
      <p className="st-title">{title}</p>
      {hint && <p className="st-detail">{hint}</p>}
    </div>
  );
}

export interface AsyncViewProps<T> {
  state: AsyncState<T>;
  loadingLabel: string;
  errorTitle: string;
  emptyTitle: string;
  emptyHint?: string;
  children: (data: T) => ReactNode;
}

/**
 * Renders an async state, handling all four cases.
 *
 * The children function only ever sees loaded, non-empty data, so a pane never
 * has to guard against undefined — which is what stops the "render nothing and
 * hope" branch from existing at all.
 */
export function AsyncView<T>({
  state,
  loadingLabel,
  errorTitle,
  emptyTitle,
  emptyHint,
  children,
}: AsyncViewProps<T>) {
  switch (state.status) {
    case 'loading':
      return <Loading label={loadingLabel} />;
    case 'error':
      return <Failed title={errorTitle} error={state.error} onRetry={state.retry} />;
    case 'empty':
      return <Empty title={emptyTitle} hint={emptyHint} />;
    case 'ready':
      return <>{children(state.data)}</>;
  }
}
