import { useCallback, useState } from 'react';

import { ipc } from '../ipc';
import './settings.css';

/**
 * Settings: small, plain, and until now missing.
 *
 * Its absence was a real gap rather than a cosmetic one — the career folder
 * could be chosen on first run and never changed again, so pointing the app at
 * a different folder meant deleting the database. `chooseCareerRoot` was
 * already bound; nothing after first run called it.
 *
 * Everything here is a fact about the machine, not a preference invented for
 * the sake of a settings screen. Nothing speculative gets a switch: options
 * arrive when the QA cycles prove one is needed.
 */
export interface SettingsProps {
  careerRoot: string;
  theme: string;
  onToggleTheme: () => void;
  /** Re-reads the workspace after the folder changes. */
  onRootChanged: () => void;
}

export function Settings({ careerRoot, theme, onToggleTheme, onRootChanged }: SettingsProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const change = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const chosen = await ipc().chooseCareerRoot();
      // Cancelling is not a failure. Putting a message on screen for a
      // deliberate change of mind is noise.
      if (chosen !== '') onRootChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [onRootChanged]);

  return (
    <div className="se">
      <h1 className="se-title">Settings</h1>

      <section className="se-block">
        <h2 className="se-head">Career folder</h2>
        <p className="se-note">
          Everything Threadline reads lives under this folder. Changing it re-scans; nothing is
          copied or moved.
        </p>
        <p className="se-path">{careerRoot}</p>
        <button
          type="button"
          className="se-btn"
          disabled={busy}
          onClick={() => {
            void change();
          }}
        >
          {busy ? 'Choosing…' : 'Change…'}
        </button>
        {error !== null && (
          <p className="se-error" role="alert">
            {error}
          </p>
        )}
      </section>

      <section className="se-block">
        <h2 className="se-head">Theme</h2>
        <p className="se-note">Dark is the surface that was tuned for long reading.</p>
        <button type="button" className="se-btn" onClick={onToggleTheme}>
          {theme === 'dark' ? 'Switch to light' : 'Switch to dark'}
        </button>
      </section>

      <section className="se-block">
        <h2 className="se-head">Database</h2>
        <p className="se-note">
          Sessions, hours, page positions and notes — the things a file cannot hold. Delete it and
          you lose that history and nothing else; your files are untouched.
        </p>
        {/*
          The path is stated rather than opened. A "Show in Explorer" button
          would be a command spent on chrome against a budget of 20 (C2), and
          the path is copyable as text.
        */}
        <p className="se-path">%LOCALAPPDATA%\Threadline\threadline.db</p>
      </section>

      <section className="se-block">
        <h2 className="se-head">About</h2>
        <p className="se-note">
          Threadline v0.1.0 — offline. No account, no sync, no telemetry, and no network calls at
          all.
        </p>
      </section>
    </div>
  );
}
