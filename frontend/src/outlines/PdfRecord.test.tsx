import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { setIPC } from '../ipc';
import type { Artifact, OutlineView } from '../ipc';
import { MockIPC } from '../ipc/mock';

import { PdfPane } from './PdfPane';
import { PdfRecord } from './PdfRecord';

// Every non-test component in this folder, as text.
const sources = import.meta.glob(['./*.tsx', '!./*.test.tsx'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const STRIPPED = [
  'Edge PDF Sync',
  'Edge instance listener',
  'REVISION CADENCE',
  'Retention rate',
  'outline verified',
  'SYS-601',
  'v7.2 Engine Specification',
  'CURRENT BOOKMARK',
];

// ACID has no outline in the mock.
const acid: Artifact = {
  id: 3,
  path: '02 - Databases & Storage/ACID.pdf',
  title: 'ACID',
  ext: '.pdf',
  isPlanFile: false,
};

const artifact: Artifact = {
  id: 1,
  path: 'Study guided & notes/06 - System Design/Fundamentals v3.pdf',
  title: 'Fundamentals v3',
  ext: '.pdf',
  isPlanFile: false,
};

/** Nine sections over 49 pages; ticked as given. */
function outline(ticked: number[], total = 49): OutlineView {
  const starts = [1, 3, 5, 8, 13, 19, 26, 34, 42];
  const titles = [
    'Scalability',
    'Latency',
    'Availability',
    'Consistency',
    'DNS',
    'CDNs',
    'Load balancers',
    'Databases',
    'Caching',
  ];
  const done = ticked.length;
  return {
    exists: true,
    outline: {
      total,
      sections: starts.map((page, i) => ({
        title: titles[i],
        page,
        checked: ticked.includes(i),
        lineNo: i + 5,
      })),
    },
    ranges: starts.map((from, i) => ({
      from,
      to: i + 1 < starts.length ? starts[i + 1] - 1 : total,
    })),
    progress: {
      sectionsDone: done,
      sections: 9,
      // The figures below are the ones the record was given; it must not
      // recompute or round them.
      pagesDone: total > 0 ? 12 : 0,
      pages: total,
      pagesKnown: total > 0,
    },
  };
}

const none: OutlineView = {
  exists: false,
  outline: { total: 0, sections: [] },
  ranges: [],
  progress: { sectionsDone: 0, sections: 0, pagesDone: 0, pages: 0, pagesKnown: false },
};

function record(view: OutlineView, handlers: Partial<Parameters<typeof PdfRecord>[0]> = {}) {
  const props = {
    artifact,
    view,
    onOpen: vi.fn(),
    onTick: vi.fn(),
    onAddOutline: vi.fn(),
    ...handlers,
  };
  render(<PdfRecord {...props} />);
  return props;
}

/** Every piece of text a person could read or hear, per element. */
function readable(): string[] {
  const out = [document.body.textContent ?? ''];
  for (const el of document.body.querySelectorAll('*')) {
    for (const attr of ['aria-label', 'title', 'placeholder', 'aria-valuetext', 'alt']) {
      const value = el.getAttribute(attr);
      if (value !== null) out.push(value);
    }
  }
  return out;
}

describe('the PDF record', () => {
  it('shows both counts and NEXT from the outline', async () => {
    const user = userEvent.setup();
    const { onOpen, onTick } = record(outline([0, 1, 2, 3]));

    expect(screen.getByText('4 of 9 sections')).toBeTruthy();
    expect(screen.getByText('12 of 49 pages')).toBeTruthy();

    // NEXT is the first unticked section, and only that one.
    const next = screen.getAllByText('NEXT');
    expect(next).toHaveLength(1);
    expect(next[0].closest('li')?.textContent).toContain('DNS');

    // Edge opens at NEXT's page.
    await user.click(screen.getByRole('button', { name: 'Open in Edge at page 13' }));
    expect(onOpen).toHaveBeenCalledWith(13);

    // Ticking names the section by position.
    await user.click(screen.getByRole('checkbox', { name: 'DNS' }));
    expect(onTick).toHaveBeenCalledWith(4, true);
    await user.click(screen.getByRole('checkbox', { name: 'Scalability' }));
    expect(onTick).toHaveBeenLastCalledWith(0, false);
    cleanup();

    // Every section ticked: nothing is next, and Edge opens at the start.
    record(outline([0, 1, 2, 3, 4, 5, 6, 7, 8]));
    expect(screen.getByText('9 of 9 sections')).toBeTruthy();
    expect(screen.queryByText('NEXT')).toBeNull();
    expect(screen.getByRole('button', { name: 'Open in Edge' })).toBeTruthy();
    cleanup();

    // No page total: the section count stands, and no page figure appears.
    // Matched per element: body text runs "pages" into the next heading, so
    // a word-boundary search of the whole body would miss it.
    record(outline([0, 1, 2, 3], 0));
    expect(screen.getByText('4 of 9 sections')).toBeTruthy();
    expect(screen.queryByText(/\bpages\b/)).toBeNull();
  });

  it('labels nothing NEXT once every section is ticked', () => {
    record(outline([0, 1, 2, 3, 4, 5, 6, 7, 8]));
    expect(screen.queryByText('NEXT')).toBeNull();
    // With nothing next, Edge opens at the start.
    expect(screen.getByRole('button', { name: 'Open in Edge' })).toBeTruthy();
  });

  it('shows no page figure when no page total was recorded', () => {
    record(outline([0, 1, 2, 3], 0));
    expect(screen.getByText('4 of 9 sections')).toBeTruthy();
    expect(screen.queryByText(/\bpages\b/)).toBeNull();
    expect(document.body.textContent).not.toMatch(/of 0/);
  });

  // Through PdfPane, which is what ships: an error state added in the wrapper
  // would never show up in a test of the record alone.
  it('a file with no outline invites one and is not an error', async () => {
    const user = userEvent.setup();
    const mock = new MockIPC();
    const open = vi.spyOn(mock, 'openExternal');
    setIPC(mock);
    render(<PdfPane artifact={acid} />);

    const add = await screen.findByRole('button', { name: 'Add outline' });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);

    // Still opens, at page 1: untracked, not unusable.
    await user.click(screen.getByRole('button', { name: 'Open in Edge' }));
    expect(open).toHaveBeenCalledWith(3, 0);
    expect(screen.queryByRole('alert')).toBeNull();

    // The invitation leads to the import screen.
    await user.click(add);
    expect(screen.getByLabelText('Table of contents')).toBeTruthy();
  });

  // An alert is kept for a real failure, so its absence above means something.
  it('says why when Edge could not be opened', async () => {
    const user = userEvent.setup();
    const mock = new MockIPC();
    vi.spyOn(mock, 'openExternal').mockRejectedValue(new Error('microsoft Edge was not found'));
    setIPC(mock);
    render(<PdfPane artifact={acid} />);

    await user.click(await screen.findByRole('button', { name: 'Open in Edge' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/Edge was not found/);
  });

  it('carries none of the stripped mockup labels', async () => {
    const hits: string[] = [];
    const check = (where: string) => {
      const text = readable().join('\n').toLowerCase();
      for (const label of STRIPPED) {
        if (text.includes(label.toLowerCase())) hits.push(`${label} in ${where}`);
      }
    };

    // The record in every state it has.
    const states: [string, OutlineView, ReadonlySet<number>?][] = [
      ['no outline', none],
      ['some ticked', outline([0, 1, 2, 3])],
      ['all ticked', outline([0, 1, 2, 3, 4, 5, 6, 7, 8])],
      ['no total', outline([0, 1], 0)],
      ['pending', outline([0]), new Set([1])],
    ];
    for (const [where, view, pending] of states) {
      const { unmount } = render(
        <PdfRecord
          artifact={artifact}
          view={view}
          pending={pending}
          onOpen={vi.fn()}
          onTick={vi.fn()}
          onAddOutline={vi.fn()}
        />,
      );
      check(where);
      unmount();
    }

    // The pane that ships, for a PDF with an outline and one without.
    setIPC(new MockIPC());
    for (const pdf of [artifact, acid]) {
      const { unmount } = render(<PdfPane artifact={pdf} />);
      await screen.findByRole('heading', { level: 1, name: pdf.title });
      check(`PdfPane ${pdf.title}`);
      unmount();
    }

    // And the source, for a label shown only in a state not rendered above.
    for (const [file, source] of Object.entries(sources)) {
      const code = source
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '')
        .toLowerCase();
      for (const label of STRIPPED) {
        if (code.includes(label.toLowerCase())) hits.push(`${label} in ${file}`);
      }
    }

    expect(hits).toEqual([]);
  });

  it('names the topic the file sits in', () => {
    record(outline([]));
    const title = screen.getByRole('heading', { level: 1, name: 'Fundamentals v3' });
    const header = title.closest('header');
    expect(header).not.toBeNull();
    expect(within(header!).getByText('06 - System Design')).toBeTruthy();
  });
});
