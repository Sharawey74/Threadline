import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => ({
  WindowMinimise: vi.fn(),
  WindowToggleMaximise: vi.fn(),
  Quit: vi.fn(),
}));
vi.mock('../../wailsjs/runtime/runtime', () => runtime);

const { windowControls } = await import('./window');

beforeEach(() => {
  Object.values(runtime).forEach((fn) => fn.mockClear());
});

afterEach(() => {
  delete (window as unknown as Record<string, unknown>).runtime;
});

describe('window controls', () => {
  it('call the Wails runtime inside the window', () => {
    (window as unknown as Record<string, unknown>).runtime = {};

    windowControls.minimise();
    windowControls.toggleMaximise();
    windowControls.close();

    expect(runtime.WindowMinimise).toHaveBeenCalledOnce();
    expect(runtime.WindowToggleMaximise).toHaveBeenCalledOnce();
    expect(runtime.Quit).toHaveBeenCalledOnce();
  });

  // In a plain browser the runtime is absent. Calling it would throw on the
  // first click, so the controls must be inert there instead.
  it('do nothing in a browser with no runtime', () => {
    windowControls.minimise();
    windowControls.toggleMaximise();
    windowControls.close();

    expect(runtime.WindowMinimise).not.toHaveBeenCalled();
    expect(runtime.WindowToggleMaximise).not.toHaveBeenCalled();
    expect(runtime.Quit).not.toHaveBeenCalled();
  });
});
