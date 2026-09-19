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

const existing: Outline = {
  total: 49,
  sections: [
    { title: 'Scalability', page: 1, checked: true, lineNo: 5 },
    { title: 'DNS', page: 13, checked: false, lineNo: 6 },
  ],
};

/** The three modes the design offered, and a one-of-many control of any kind. */
const MODES = /trackable checklist|note anchors only|\bboth\b/i;
const CHOICES =
  'input[type="radio" i], [role="radio"], [role="radiogroup"], [role="menuitemradio"], select';
const SOURCE_CHOICES = ['type="radio', 'role="radio', 'radiogroup', 'menuitemradio', '<select'];

// Every non-test file in this folder, as text.
const sources = import.meta.glob(['./*.{ts,tsx}', '!./*.test.{ts,tsx}'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

/** Source with comments removed and whitespace folded, so a wrapped name still reads whole. */
function foldSource(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
    .replace(/\{' '\}/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

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

  // The property, whatever the control is built from and whichever state it
  // appears in: nothing names one of the three modes, and nothing offers a
  // one-of-many choice. Checked on every state the screen has, and in the
  // source, so a selector shown only in some state still fails.
  it('offers no mode selector', async () => {
    const user = userEvent.setup();
    const found: string[] = [];
    const check = (state: string) => {
      for (const el of document.body.querySelectorAll('*')) {
        const names = [el.textContent ?? ''];
        for (const attr of ['aria-label', 'title', 'placeholder', 'value', 'alt']) {
          names.push(el.getAttribute(attr) ?? '');
        }
        for (const ref of (el.getAttribute('aria-labelledby') ?? '').split(/\s+/)) {
          if (ref !== '') names.push(document.getElementById(ref)?.textContent ?? '');
        }
        for (const name of names.filter((n) => MODES.test(n))) found.push(`${state}: "${name}"`);
      }
      for (const el of document.querySelectorAll(CHOICES)) found.push(`${state}: ${el.outerHTML}`);
    };

    // Empty, before anything is pasted.
    const { unmount } = render(
      <OutlineImport artifact={acid} initial={empty} onSaved={vi.fn()} onCancel={vi.fn()} />,
    );
    check('empty');

    // After a paste.
    await paste(user, '1. Preface.... 1\n2. Storage....... 9');
    await waitFor(() => {
      expect(rows()).toHaveLength(2);
    });
    check('pasted');
    unmount();

    // Editing an outline that already exists.
    render(
      <OutlineImport artifact={acid} initial={existing} onSaved={vi.fn()} onCancel={vi.fn()} />,
    );
    check('editing');

    // The source of every component and helper here, for a state not
    // rendered above. Comments are dropped: the docblock names the modes to
    // say they are gone.
    for (const [file, source] of Object.entries(sources)) {
      const code = foldSource(source);
      if (MODES.test(code)) found.push(`${file}: names a mode`);
      for (const pattern of SOURCE_CHOICES) {
        if (code.includes(pattern)) found.push(`${file}: ${pattern}`);
      }
    }

    expect(found).toEqual([]);
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
