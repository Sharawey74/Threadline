import { Minus, Square, X } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';

import { windowControls } from '../ipc/window';
import './shell.css';

/*
 * Wails reads this custom property to decide which parts of a frameless window
 * drag it. The bar drags; anything clickable inside it must opt back out, or a
 * click on a button starts a window move instead.
 */
const drag = { '--wails-draggable': 'drag' } as CSSProperties;
const noDrag = { '--wails-draggable': 'no-drag' } as CSSProperties;

export interface TitleBarProps {
  /** The career root. The app is a lens over one folder, so it is always shown. */
  root: string;
  /** App-level actions, placed before the window controls. */
  children?: ReactNode;
}

/**
 * The window's own title bar, replacing the system one.
 *
 * Windows controls, on the right, in the order Windows puts them: minimise,
 * maximise, close. The design canvas drew macOS traffic lights on a Windows
 * app; this is what the platform actually looks like.
 */
export function TitleBar({ root, children }: TitleBarProps) {
  return (
    <header className="sh-title" style={drag}>
      <span className="sh-brand">Threadline</span>
      <span className="sh-root" title={root}>
        {root}
      </span>

      <span className="sh-grow" />

      {children !== undefined && (
        <div className="sh-actions" style={noDrag}>
          {children}
        </div>
      )}

      <div className="sh-winctl" style={noDrag} role="group" aria-label="Window">
        <button
          type="button"
          className="sh-winbtn"
          aria-label="Minimise"
          onClick={windowControls.minimise}
        >
          <Minus aria-hidden="true" />
        </button>
        <button
          type="button"
          className="sh-winbtn"
          aria-label="Maximise"
          onClick={windowControls.toggleMaximise}
        >
          <Square aria-hidden="true" />
        </button>
        <button
          type="button"
          className="sh-winbtn sh-winbtn-close"
          aria-label="Close"
          onClick={windowControls.close}
        >
          <X aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}
