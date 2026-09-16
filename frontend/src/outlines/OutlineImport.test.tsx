import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { setIPC } from '../ipc';
import type { Artifact, Outline } from '../ipc';
import { MockIPC } from '../ipc/mock';

import { OutlineImport } from './OutlineImport';

// ACID has no outline in the mock.
const acid: Artifact = {
  id: 3,
  path: '02 - Databases & Storage/ACID.pdf',
  title: 'ACID',
  ext: '.pdf',
  isPlanFile: false,
};

const empty: Outline = { total: 0, sections: [] };

let mock: MockIPC;

beforeEach(() => {
  mock = new MockIPC();
  setIPC(mock);
});

/** The parsed rows, as "title@page" in order. */
function rows(): string[] {
  const list = screen.getByRole('list', { name: 'Parsed sections' });
  return within(list)
    .queryAllByRole('listitem')
    .map((li) => {
      const title = li.querySelector('.oi-row-title')?.textContent ?? '';
      const page = within(li).getByRole('spinbutton') as HTMLInputElement;
      return `${title}@${page.value}`;
    });
}

async function paste(user: ReturnType<typeof userEvent.setup>, text: string) {
  const box = screen.getByLabelText('Table of contents');
  await user.click(box);
  await user.paste(text);
}

describe('the outline import screen', () => {
  it('pasted text becomes parsed sections', async () => {
    const user = userEvent.setup();
    const save = vi.spyOn(mock, 'saveOutline');
    render(<OutlineImport artifact={acid} initial={empty} onSaved={vi.fn()} onCancel={vi.fn()} />);

    await paste(user, '3. Indexes........ 47');

    await waitFor(() => {
      expect(rows()).toEqual(['Indexes@47']);
    });
    // Parsed, not saved.
    expect(save).not.toHaveBeenCalled();
    // The page total is the user's to enter.
    expect(screen.getByRole('spinbutton', { name: 'Total pages' })).toBeTruthy();
  });

  it('offers no mode selector', () => {
    render(<OutlineImport artifact={acid} initial={empty} onSaved={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.queryAllByRole('radio')).toHaveLength(0);
    expect(screen.queryAllByRole('radiogroup')).toHaveLength(0);
    expect(screen.queryAllByRole('combobox')).toHaveLength(0);
    for (const name of [/trackable checklist/i, /note anchors only/i, /^both/i]) {
      expect(screen.queryByRole('button', { name })).toBeNull();
      expect(screen.queryByRole('checkbox', { name })).toBeNull();
      expect(screen.queryByRole('option', { name })).toBeNull();
      expect(screen.queryByRole('tab', { name })).toBeNull();
      expect(screen.queryByText(name)).toBeNull();
    }
  });

  it('edits and reordering reach the saved outline', async () => {
    const user = userEvent.setup();
    const save = vi.spyOn(mock, 'saveOutline');
    const onSaved = vi.fn();
    render(<OutlineImport artifact={acid} initial={empty} onSaved={onSaved} onCancel={vi.fn()} />);

    await paste(user, '1. Preface.... 1\n2. Storage....... 9\n3. Indexes........ 47');
    await waitFor(() => {
      expect(rows()).toEqual(['Preface@1', 'Storage@9', 'Indexes@47']);
    });

    // Edit a page.
    const storagePage = screen.getByRole('spinbutton', { name: 'Start page of Storage' });
    await user.clear(storagePage);
    await user.type(storagePage, '12');

    // Move Indexes up, by its own control, and keep focus on the moved row.
    const up = screen.getByRole('button', { name: 'Move Indexes up' });
    await user.click(up);
    expect(rows()).toEqual(['Preface@1', 'Indexes@47', 'Storage@12']);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Move Indexes up' }));
    expect(screen.getByRole('status').textContent).toBe('Indexes moved to position 2 of 3');

    // The ends cannot move further, and say so.
    const top = screen.getByRole('button', { name: 'Move Preface up' });
    expect(top.getAttribute('aria-disabled')).toBe('true');
    await user.click(top);
    expect(rows()[0]).toBe('Preface@1');

    await user.click(screen.getByRole('button', { name: 'Move Preface down' }));
    expect(rows()).toEqual(['Indexes@47', 'Preface@1', 'Storage@12']);

    const total = screen.getByRole('spinbutton', { name: 'Total pages' });
    await user.type(total, '60');

    await user.click(screen.getByRole('button', { name: 'Save outline' }));

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalledOnce();
    });
    expect(save).toHaveBeenCalledOnce();
    const [id, saved] = save.mock.calls[0];
    expect(id).toBe(3);
    expect(saved.total).toBe(60);
    expect(saved.sections.map((s) => [s.title, s.page])).toEqual([
      ['Indexes', 47],
      ['Preface', 1],
      ['Storage', 12],
    ]);
  });

  it('starts from the existing outline when editing one', async () => {
    const user = userEvent.setup();
    const save = vi.spyOn(mock, 'saveOutline');
    const initial: Outline = {
      total: 49,
      sections: [
        { title: 'Scalability', page: 1, checked: true, lineNo: 5 },
        { title: 'DNS', page: 13, checked: false, lineNo: 6 },
      ],
    };
    render(
      <OutlineImport artifact={acid} initial={initial} onSaved={vi.fn()} onCancel={vi.fn()} />,
    );

    expect(rows()).toEqual(['Scalability@1', 'DNS@13']);
    expect(
      (screen.getByRole('spinbutton', { name: 'Total pages' }) as HTMLInputElement).value,
    ).toBe('49');

    await user.click(screen.getByRole('button', { name: 'Save outline' }));
    await waitFor(() => {
      expect(save).toHaveBeenCalledOnce();
    });
  });

  it('refuses to save a page that is not a whole number', async () => {
    const user = userEvent.setup();
    const save = vi.spyOn(mock, 'saveOutline');
    render(<OutlineImport artifact={acid} initial={empty} onSaved={vi.fn()} onCancel={vi.fn()} />);

    await paste(user, '1. Preface.... 1');
    await waitFor(() => {
      expect(rows()).toEqual(['Preface@1']);
    });
    await user.clear(screen.getByRole('spinbutton', { name: 'Start page of Preface' }));
    await user.click(screen.getByRole('button', { name: 'Save outline' }));

    expect(save).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toMatch(/Preface/);
  });

  it('cancels without saving', async () => {
    const user = userEvent.setup();
    const save = vi.spyOn(mock, 'saveOutline');
    const onCancel = vi.fn();
    render(<OutlineImport artifact={acid} initial={empty} onSaved={vi.fn()} onCancel={onCancel} />);

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledOnce();
    expect(save).not.toHaveBeenCalled();
  });
});
