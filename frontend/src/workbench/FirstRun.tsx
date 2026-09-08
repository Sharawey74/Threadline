import { useCallback, useState } from 'react';

import { ipc } from '../ipc';
import './firstrun.css';

/**
 * The screen before a career folder is chosen.
 *
 * This is not an error state and must not look like one. Nothing has failed —
 * the app simply has not been pointed at anything yet. Rendering a normal
 * first launch in the drift colour teaches the user to distrust the red they
 * will later need to believe, and the reconciliation colour is the one signal
 * that has to keep its meaning.
 *
 * It replaces the whole screen rather than appearing inside a pane. A missing
 * career folder is a fact about the workspace, not about the material list or
 * the checklist, and letting each pane discover it separately produced the
 * same message three times with two identical buttons.
 */
export interface FirstRunProps {
  /** Why a remembered folder could not be reopened. Empty on a true first run. */
  problem?: string;
  onChosen: () => void;
}

export function FirstRun({ problem, onChosen }: FirstRunProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const choose = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const chosen = await ipc().chooseCareerRoot();
      // Cancelling is not a failure. The user changed their mind, and putting
      // a message on screen for a deliberate action would be noise.
      if (chosen !== '') onChosen();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [onChosen]);

  return (
    <div className="fr">
      <div className="fr-panel">
        <h1 className="fr-title">Threadline</h1>
        <p className="fr-lead">
          Point it at your career folder — the one holding your plan file and
          study material. Nothing is copied or moved; Threadline reads what is
          already there.
        </p>

        {problem !== undefined && problem !== '' && (
          // A remembered folder that has gone is worth explaining: it was
          // working yesterday, and the user is entitled to know what changed.
          <p className="fr-problem" role="status">
            The folder you chose last time could not be opened. {problem}
          </p>
        )}

        <button
          type="button"
          className="fr-choose"
          onClick={() => {
            void choose();
          }}
          disabled={busy}
        >
          {busy ? 'Choosing…' : 'Choose folder'}
        </button>

        {error !== null && (
          <p className="fr-error" role="alert">
            {error}
          </p>
        )}

        <p className="fr-note">
          Threadline keeps its own notes and hours in a separate database. Your
          files stay yours: the only change it ever makes is ticking a checkbox
          in the plan file.
        </p>
      </div>
    </div>
  );
}
