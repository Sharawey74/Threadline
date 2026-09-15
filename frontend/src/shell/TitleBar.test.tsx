import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => ({
  WindowMinimise: vi.fn(),
  WindowToggleMaximise: vi.fn(),
  Quit: vi.fn(),
}));
vi.mock('../../wailsjs/runtime/runtime', () => runtime);

const { TitleBar } = await import('./TitleBar');

beforeEach(() => {
  Object.values(runtime).forEach((fn) => fn.mockClear());
  (window as unknown as Record<string, unknown>).runtime = {};
});

afterEach(() => {
  delete (window as unknown as Record<string, unknown>).runtime;
});

describe('the title bar', () => {
  it('has Windows window controls', async () => {
    const user = userEvent.setup();
    render(<TitleBar root="C:/Career" />);

    const controls = within(screen.getByRole('group', { name: 'Window' })).getAllByRole('button');
    expect(controls.map((b) => b.getAttribute('aria-label'))).toEqual([
      'Minimise',
      'Maximise',
      'Close',
    ]);

    await user.click(controls[0]);
    expect(runtime.WindowMinimise).toHaveBeenCalledOnce();
    await user.click(controls[1]);
    expect(runtime.WindowToggleMaximise).toHaveBeenCalledOnce();
    await user.click(controls[2]);
    expect(runtime.Quit).toHaveBeenCalledOnce();
  });

  it('always shows the career root', () => {
    render(<TitleBar root="C:/Users/DELL/Desktop/Career" />);
    expect(screen.getByText('C:/Users/DELL/Desktop/Career')).toBeTruthy();
  });
});
