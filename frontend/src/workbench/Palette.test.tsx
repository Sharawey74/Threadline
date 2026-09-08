import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { Artifact } from '../ipc/types';
import { Palette } from './Palette';

const files: Artifact[] = [
  {
    id: 1,
    path: '06 - System Design/Fundamentals v3.pdf',
    title: 'Fundamentals v3',
    ext: '.pdf',
    isPlanFile: false,
  },
  {
    id: 2,
    path: '02 - Databases & Storage/ACID.pdf',
    title: 'ACID',
    ext: '.pdf',
    isPlanFile: false,
  },
];

function setup(overrides: Partial<React.ComponentProps<typeof Palette>> = {}) {
  const onOpenFile = vi.fn();
  const onOpenChange = vi.fn();
  const run = vi.fn();

  render(
    <Palette
      open
      onOpenChange={onOpenChange}
      files={files}
      onOpenFile={onOpenFile}
      actions={[{ id: 'theme', label: 'Switch to light theme', hint: 'T', run }]}
      {...overrides}
    />,
  );

  return { onOpenFile, onOpenChange, run, user: userEvent.setup() };
}

describe('the command palette', () => {
  it('lists documents and commands together', () => {
    setup();

    expect(screen.getByRole('option', { name: /Fundamentals v3/ })).toBeTruthy();
    expect(screen.getByRole('option', { name: /Switch to light theme/ })).toBeTruthy();
  });

  it('opens a document and closes itself', async () => {
    const { onOpenFile, onOpenChange, user } = setup();

    await user.click(screen.getByRole('option', { name: /Fundamentals v3/ }));

    expect(onOpenFile).toHaveBeenCalledWith(files[0]);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('runs a command and closes itself', async () => {
    const { run, onOpenChange, user } = setup();

    await user.click(screen.getByRole('option', { name: /Switch to light theme/ }));

    expect(run).toHaveBeenCalledOnce();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  // Typing a folder name has to find what is inside it, not only files named
  // after it - otherwise the palette cannot reach a document whose folder you
  // remember and whose title you do not.
  it('matches a document by its folder as well as its title', async () => {
    const { user } = setup();

    await user.type(screen.getByRole('combobox'), 'Databases');

    await waitFor(() => {
      expect(screen.getByRole('option', { name: /ACID/ })).toBeTruthy();
    });
    expect(screen.queryByRole('option', { name: /Fundamentals/ })).toBeNull();
  });

  it('says so when nothing matches', async () => {
    const { user } = setup();

    await user.type(screen.getByRole('combobox'), 'zzzz');

    await waitFor(() => {
      expect(screen.getByText(/Nothing matches/)).toBeTruthy();
    });
  });

  // Arrow keys move a selection marker rather than focus, so the input keeps
  // focus and typing never stops working mid-search.
  it('keeps focus in the input while arrowing through results', async () => {
    const { user } = setup();
    const input = screen.getByRole('combobox');

    await user.keyboard('{ArrowDown}');

    expect(document.activeElement).toBe(input);
  });

  it('renders nothing at all while closed', () => {
    setup({ open: false });

    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.queryByRole('option')).toBeNull();
  });
});
