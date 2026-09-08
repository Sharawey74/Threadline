import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { Artifact } from '../ipc/types';
import { useTabs } from './useTabs';

const file = (id: number, title: string): Artifact => ({
  id,
  path: `06 - System Design/${title}.pdf`,
  title,
  ext: '.pdf',
  isPlanFile: false,
});

const a = file(1, 'Fundamentals v3');
const b = file(2, 'Interview Q&A');
const c = file(3, 'Part 1');

describe('useTabs', () => {
  it('starts on the checklist with nothing open', () => {
    const { result } = renderHook(() => useTabs());

    expect(result.current.open).toEqual([]);
    expect(result.current.active).toBeNull();
  });

  it('opens a document and focuses it', () => {
    const { result } = renderHook(() => useTabs());

    act(() => {
      result.current.openTab(a);
    });

    expect(result.current.open).toEqual([a]);
    expect(result.current.active).toEqual(a);
  });

  // Two tabs for one file would let its page and scroll differ between them,
  // and the position is stored per artifact rather than per tab.
  it('focuses an already-open document instead of opening it twice', () => {
    const { result } = renderHook(() => useTabs());

    act(() => {
      result.current.openTab(a);
      result.current.openTab(b);
      result.current.openTab(a);
    });

    expect(result.current.open).toEqual([a, b]);
    expect(result.current.active).toEqual(a);
  });

  it('focuses the neighbour to the right when the active tab closes', () => {
    const { result } = renderHook(() => useTabs());

    act(() => {
      result.current.openTab(a);
      result.current.openTab(b);
      result.current.openTab(c);
      result.current.focusTab(b.id);
    });
    act(() => {
      result.current.closeTab(b.id);
    });

    expect(result.current.open).toEqual([a, c]);
    expect(result.current.active).toEqual(c);
  });

  // At the end of the row there is no right-hand neighbour, so the focus takes
  // the left rather than jumping across the bar to the start.
  it('focuses the left neighbour when the last tab closes', () => {
    const { result } = renderHook(() => useTabs());

    act(() => {
      result.current.openTab(a);
      result.current.openTab(b);
    });
    act(() => {
      result.current.closeTab(b.id);
    });

    expect(result.current.active).toEqual(a);
  });

  it('leaves the focus alone when a different tab closes', () => {
    const { result } = renderHook(() => useTabs());

    act(() => {
      result.current.openTab(a);
      result.current.openTab(b);
      result.current.openTab(c);
    });
    act(() => {
      result.current.closeTab(a.id);
    });

    expect(result.current.open).toEqual([b, c]);
    expect(result.current.active).toEqual(c);
  });

  it('returns to the checklist when the last tab closes', () => {
    const { result } = renderHook(() => useTabs());

    act(() => {
      result.current.openTab(a);
    });
    act(() => {
      result.current.closeTab(a.id);
    });

    expect(result.current.open).toEqual([]);
    expect(result.current.active).toBeNull();
  });

  it('ignores a close for a document that is not open', () => {
    const { result } = renderHook(() => useTabs());

    act(() => {
      result.current.openTab(a);
    });
    act(() => {
      result.current.closeTab(99);
    });

    expect(result.current.open).toEqual([a]);
    expect(result.current.active).toEqual(a);
  });

  // Escape returns to the checklist. It must not close anything: coming back
  // to a document you were reading should not cost you the other tabs.
  it('blurs to the checklist without closing anything', () => {
    const { result } = renderHook(() => useTabs());

    act(() => {
      result.current.openTab(a);
      result.current.openTab(b);
    });
    act(() => {
      result.current.blur();
    });

    expect(result.current.active).toBeNull();
    expect(result.current.open).toEqual([a, b]);
  });
});
