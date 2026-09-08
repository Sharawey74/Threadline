import React from 'react';
import { createRoot } from 'react-dom/client';

import App from './App';
import { setIPC } from './ipc';
import { MockIPC } from './ipc/mock';
import { WailsIPC } from './ipc/wails';
import './workbench/theme.css';

/**
 * The bridge is installed once, here, before anything renders.
 *
 * Which one depends on where the page is running. Inside the Wails window the
 * runtime is present and the real bridge talks to Go; opened in an ordinary
 * browser it is not, and the mock keeps the whole workbench usable against
 * fixture data.
 *
 * That is the payoff of `ipc/` being a boundary rather than a convenience: one
 * line decides, and nothing else in the frontend knows which it got.
 */
setIPC(inWailsWindow() ? new WailsIPC() : new MockIPC());

/**
 * True when the Wails runtime is present.
 *
 * Wails injects `window.runtime` before the app script runs. Checking for it
 * beats a build-time flag, because a development build opened in a browser and
 * the same build inside the window are the same bundle — and getting that
 * wrong means a blank screen with a confusing error instead of a working mock.
 */
function inWailsWindow(): boolean {
  return typeof window !== 'undefined' && 'runtime' in window;
}

const container = document.getElementById('root');
if (container === null) {
  throw new Error('#root is missing from index.html');
}

createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
