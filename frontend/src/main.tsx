import React from 'react';
import { createRoot } from 'react-dom/client';

import App from './App';
import { setIPC } from './ipc';
import { MockIPC } from './ipc/mock';
import './workbench/theme.css';

/**
 * The bridge is installed once, here, before anything renders.
 *
 * I3 runs against the mock: no Go, no database, the whole workbench usable in
 * a plain browser. I4 swaps this one line for the Wails bridge and nothing
 * else in the frontend changes — which is the entire reason `ipc/` exists as a
 * boundary rather than as a convenience.
 */
setIPC(new MockIPC());

const container = document.getElementById('root');
if (container === null) {
  throw new Error('#root is missing from index.html');
}

createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
