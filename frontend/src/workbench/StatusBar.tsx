import { AlertTriangle, Check } from 'lucide-react';

import type { Check as PlanCheck } from '../ipc/types';
import './statusbar.css';

/**
 * The status bar, and the first place reconciliation has ever been visible.
 *
 * The checks have run on every scan since I1 and nothing showed them:
 * `getReconciliation` was bound, typed, tested and called by nobody. Drift is
 * the product — the plan's own numbers disagreeing with each other or with the
 * disk is the thing this app knows that nothing else on the machine does — and
 * it was being computed correctly and thrown away.
 *
 * It goes here rather than in a pane of its own because drift is context for
 * what you are about to do, not a report you make a trip to read. The full
 * thirteen live on the Hours view.
 */
export interface StatusBarProps {
  checks: PlanCheck[] | null;
  /** Where the open document is, e.g. "Page 4 of 102". Absent when nothing is open. */
  position?: string;
  /** Shown when a write is in flight or has just landed. */
  saveState?: string;
  onShowChecks?: () => void;
}

export function StatusBar({ checks, position, saveState, onShowChecks }: StatusBarProps) {
  return (
    <>
      <Reconciliation checks={checks} onShow={onShowChecks} />
      <span className="sb-sep" aria-hidden="true" />
      {position !== undefined && <span className="sb-mono">{position}</span>}
      <span className="sb-spacer" />
      {saveState !== undefined && <span className="sb-save">{saveState}</span>}
    </>
  );
}

function Reconciliation({
  checks,
  onShow,
}: {
  checks: PlanCheck[] | null;
  onShow?: () => void;
}) {
  // Null is "not read yet", which is not the same as "nothing is wrong". A bar
  // that shows a reassuring tick while the answer is still unknown is exactly
  // the kind of unmeasured claim C5 exists to prevent.
  if (checks === null) {
    return <span className="sb-quiet">Checking the plan…</span>;
  }

  const failed = checks.filter((c) => !c.passed);

  if (failed.length === 0) {
    return (
      <span className="sb-ok">
        <Check className="sb-icon" aria-hidden="true" />
        {checks.length} checks pass
      </span>
    );
  }

  const count = failed.length === 1 ? '1 check fails' : `${String(failed.length)} checks fail`;

  return (
    <button
      type="button"
      className="sb-drift"
      // Named explicitly: the count and the label sit in separate spans, and a
      // name built by concatenation runs them together - "1 check fails§9 Now".
      aria-label={`${count}: ${failed[0]?.label ?? ''}`}
      onClick={onShow}
    >
      <AlertTriangle className="sb-icon" aria-hidden="true" />
      {/*
        The count and the first failing label, not a bare number. "1 check
        fails" tells you to go and look; naming it often means you do not have
        to. Neglect is information, not accusation - this states what
        disagrees, and nothing about whose fault it is.
      */}
      <span aria-hidden="true">{count}</span>
      <span className="sb-drift-detail" aria-hidden="true">
        {failed[0]?.label}
      </span>
    </button>
  );
}
