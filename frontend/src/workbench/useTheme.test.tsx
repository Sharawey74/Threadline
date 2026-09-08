import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useTheme } from './useTheme';

function Harness() {
  const [theme, toggle] = useTheme();
  return (
    <button type="button" onClick={toggle}>
      {theme}
    </button>
  );
}

beforeEach(() => {
  // localStorage is replaced with a fresh in-memory store by the test setup.
  delete document.documentElement.dataset.theme;
});

describe('useTheme', () => {
  it('defaults to dark', () => {
    render(<Harness />);
    // Dark by default rather than following the system: the app is read for
    // hours, often late, and the dark surface is the one that got tuned.
    expect(screen.getByRole('button').textContent).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('toggles and applies the theme to the document', async () => {
    render(<Harness />);
    await userEvent.setup().click(screen.getByRole('button'));

    expect(screen.getByRole('button').textContent).toBe('light');
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('remembers the choice across a remount', async () => {
    const { unmount } = render(<Harness />);
    await userEvent.setup().click(screen.getByRole('button'));
    unmount();

    render(<Harness />);
    expect(screen.getByRole('button').textContent).toBe('light');
  });

  it('still starts when storage is unavailable', () => {
    // A webview with site data blocked throws on read. That is a reason to
    // fall back to the default, not a reason to fail to start.
    vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
      throw new Error('storage disabled');
    });
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('storage disabled');
    });

    expect(() => {
      render(<Harness />);
    }).not.toThrow();
    expect(screen.getByRole('button').textContent).toBe('dark');
  });
});
