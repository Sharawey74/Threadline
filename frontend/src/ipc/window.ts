// The window controls: minimise, maximise and close.
//
// These are Wails runtime calls rather than bound Go commands, so they do not
// count against C2 - but they still reach into the host, so they live behind
// the same boundary as everything else that does. Opened in an ordinary
// browser there is no runtime, and the controls do nothing rather than throw.

import { Quit, WindowMinimise, WindowToggleMaximise } from '../../wailsjs/runtime/runtime';

export interface WindowControls {
  minimise(): void;
  toggleMaximise(): void;
  close(): void;
}

function hasRuntime(): boolean {
  return typeof window !== 'undefined' && 'runtime' in window;
}

export const windowControls: WindowControls = {
  minimise: () => {
    if (hasRuntime()) WindowMinimise();
  },
  toggleMaximise: () => {
    if (hasRuntime()) WindowToggleMaximise();
  },
  close: () => {
    if (hasRuntime()) Quit();
  },
};
