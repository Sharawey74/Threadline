import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { Artifact, OutlineView } from '../ipc';

import { PdfRecord } from './PdfRecord';

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
    expect(document.body.textContent).not.toMatch(/\bpages\b/);
    expect(document.body.textContent).not.toMatch(/of 0/);
  });

  it('a file with no outline invites one and is not an error', async () => {
    const user = userEvent.setup();
    const { onOpen, onAddOutline } = record(none);

    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);

    await user.click(screen.getByRole('button', { name: 'Add outline' }));
    expect(onAddOutline).toHaveBeenCalledOnce();

    // Still opens, at page 1: untracked, not unusable.
    await user.click(screen.getByRole('button', { name: 'Open in Edge' }));
    expect(onOpen).toHaveBeenCalledWith(0);
  });

  it('carries none of the stripped mockup labels', () => {
    const stripped = [
      'Edge PDF Sync',
      'Edge instance listener',
      'REVISION CADENCE',
      'Retention rate',
      'outline verified',
      'SYS-601',
      'v7.2 Engine Specification',
      'CURRENT BOOKMARK',
    ];
    for (const view of [outline([0, 1, 2, 3]), none]) {
      const { unmount } = render(
        <PdfRecord
          artifact={artifact}
          view={view}
          onOpen={vi.fn()}
          onTick={vi.fn()}
          onAddOutline={vi.fn()}
        />,
      );
      const text = readable().join('\n').toLowerCase();
      for (const label of stripped) {
        expect(text, label).not.toContain(label.toLowerCase());
      }
      unmount();
    }
  });

  it('names the topic the file sits in', () => {
    record(outline([]));
    const title = screen.getByRole('heading', { level: 1, name: 'Fundamentals v3' });
    const header = title.closest('header');
    expect(header).not.toBeNull();
    expect(within(header!).getByText('06 - System Design')).toBeTruthy();
  });
});
