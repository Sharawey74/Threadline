import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { Item } from '../ipc';
import { Checklist } from './Checklist';

function item(overrides: Partial<Item> = {}): Item {
  return {
    anchor: 'a1',
    lineNo: 1,
    checked: false,
    text: 'Notes track - topics 1 and 2',
    section: 'Now',
    role: 'schedule',
    order: 0,
    hours: 15,
    hoursConf: 'high',
    pages: 0,
    pagesConf: 'none',
    notes: [],
    ...overrides,
  };
}

describe('Checklist', () => {
  it('renders an item and its hours', () => {
    render(<Checklist items={[item()]} onTick={vi.fn()} />);
    expect(screen.getByText('Notes track - topics 1 and 2')).toBeTruthy();
    expect(screen.getByText('15h')).toBeTruthy();
  });

  it('flips the box immediately, before the write resolves', async () => {
    const user = userEvent.setup();
    // A write that never settles: the box must already have flipped.
    const onTick = vi.fn(() => new Promise<void>(() => undefined));
    render(<Checklist items={[item()]} onTick={onTick} />);

    await user.click(screen.getByRole('checkbox'));

    expect(screen.getByRole('checkbox')).toHaveProperty('checked', true);
    expect(onTick).toHaveBeenCalledWith('a1', true);
  });

  it('reverts the box and says why when the write fails', async () => {
    const user = userEvent.setup();
    const onTick = vi.fn(() => Promise.reject(new Error('plan file changed on disk')));
    render(<Checklist items={[item()]} onTick={onTick} />);

    await user.click(screen.getByRole('checkbox'));

    await waitFor(() => {
      expect(screen.getByRole('checkbox')).toHaveProperty('checked', false);
    });
    // Reverting alone is not enough: a box that flips back without a reason
    // reads as a misclick and the user retries forever.
    expect(screen.getByRole('alert').textContent).toContain('plan file changed on disk');
  });

  it('ignores a second click while the first write is in flight', async () => {
    const user = userEvent.setup();
    const onTick = vi.fn(() => new Promise<void>(() => undefined));
    render(<Checklist items={[item()]} onTick={onTick} />);

    const box = screen.getByRole('checkbox');
    await user.click(box);
    await user.click(box);

    // Two writes racing on one line is exactly the case the backend's
    // verify-before-write exists for. Do not create it from the UI.
    expect(onTick).toHaveBeenCalledTimes(1);
  });
});

describe('hours are rendered by confidence', () => {
  it('shows a high-confidence figure plainly', () => {
    render(<Checklist items={[item({ hours: 15, hoursConf: 'high' })]} onTick={vi.fn()} />);
    expect(screen.getByText('15h')).toBeTruthy();
  });

  it('marks a low-confidence figure as unconfirmed', () => {
    render(
      <Checklist
        items={[item({ hours: 25, hoursConf: 'low', notes: ['bare hour figure'] })]}
        onTick={vi.fn()}
      />,
    );
    // Shown, but visibly provisional - never as fact (C5).
    expect(screen.getByText(/unconfirmed estimate/)).toBeTruthy();
  });

  it('shows no estimate rather than 0h when the file stated none', () => {
    render(<Checklist items={[item({ hours: 0, hoursConf: 'none' })]} onTick={vi.fn()} />);

    expect(screen.getByText('no estimate')).toBeTruthy();
    // Rendering 0h here is how a budget silently loses time.
    expect(screen.queryByText('0h')).toBeNull();
  });

  it('distinguishes a stated zero from an absent figure', () => {
    render(<Checklist items={[item({ hours: 0, hoursConf: 'high' })]} onTick={vi.fn()} />);
    expect(screen.getByText('0h')).toBeTruthy();
    expect(screen.queryByText('no estimate')).toBeNull();
  });
});

describe('empty state', () => {
  it('says the section has no items rather than rendering nothing', () => {
    render(<Checklist items={[]} onTick={vi.fn()} />);
    // An empty region with no explanation reads as a broken app.
    expect(screen.getByText(/no checklist items/i)).toBeTruthy();
  });
});
