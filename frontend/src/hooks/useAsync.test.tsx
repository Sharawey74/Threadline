import { act, render, screen, waitFor } from '@testing-library/react';
import { useCallback } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { useAsync } from './useAsync';

/**
 * Renders the hook's state as text, so assertions read like the UI.
 *
 * `key` stands in for the real dependency a caller would close over — a topic
 * slug, say — and drives the useCallback the hook expects.
 */
function Probe<T>({ load, cacheKey }: { load: () => Promise<T>; cacheKey: string }) {
  // cacheKey is the dependency under test: the hook re-runs when it changes,
  // exactly as a real caller closing over a topic slug would.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- load is intentionally excluded
  const fn = useCallback(() => load(), [cacheKey]);
  const state = useAsync(fn);

  return (
    <div>
      <span data-testid="status">{state.status}</span>
      {state.status === 'ready' && (
        <span data-testid="data">{JSON.stringify(state.data)}</span>
      )}
      {state.status === 'error' && (
        <button type="button" onClick={state.retry}>
          {state.error.message}
        </button>
      )}
    </div>
  );
}

function status() {
  return screen.getByTestId('status').textContent;
}

describe('useAsync', () => {
  it('starts loading and settles on ready', async () => {
    render(<Probe cacheKey="a" load={() => Promise.resolve(['a'])} />);
    expect(status()).toBe('loading');

    await waitFor(() => {
      expect(status()).toBe('ready');
    });
    expect(screen.getByTestId('data').textContent).toBe('["a"]');
  });

  it('reports an empty array as empty, not ready', async () => {
    render(<Probe cacheKey="a" load={() => Promise.resolve([])} />);
    // "No material" and "three PDFs" are different screens. Collapsing them is
    // how a UI ends up rendering a blank panel that looks broken.
    await waitFor(() => {
      expect(status()).toBe('empty');
    });
  });

  it('does not treat a non-array result as empty', async () => {
    render(<Probe cacheKey="a" load={() => Promise.resolve({ items: [] })} />);
    await waitFor(() => {
      expect(status()).toBe('ready');
    });
  });

  it('captures a rejection as an error state', async () => {
    render(<Probe cacheKey="a" load={() => Promise.reject(new Error('bridge unavailable'))} />);
    await waitFor(() => {
      expect(status()).toBe('error');
    });
    expect(screen.getByRole('button').textContent).toBe('bridge unavailable');
  });

  it('wraps a non-Error rejection rather than losing it', async () => {
    render(<Probe cacheKey="a" load={() => Promise.reject('a bare string')} />);
    await waitFor(() => {
      expect(status()).toBe('error');
    });
    expect(screen.getByRole('button').textContent).toBe('a bare string');
  });

  it('re-runs on retry', async () => {
    let calls = 0;
    const load = () => {
      calls += 1;
      return calls === 1
        ? Promise.reject(new Error('first attempt failed'))
        : Promise.resolve(['recovered']);
    };

    render(<Probe cacheKey="a" load={load} />);
    await waitFor(() => {
      expect(status()).toBe('error');
    });

    act(() => {
      screen.getByRole('button').click();
    });

    await waitFor(() => {
      expect(status()).toBe('ready');
    });
    expect(screen.getByTestId('data').textContent).toBe('["recovered"]');
  });

  it('discards a superseded result', async () => {
    // The classic race: switching topics quickly lets a slow first response
    // land after a fast second one and overwrite it.
    let resolveSlow: (v: string[]) => void = () => undefined;
    const slow = new Promise<string[]>((r) => {
      resolveSlow = r;
    });

    const { rerender } = render(<Probe cacheKey="topic-1" load={() => slow} />);
    rerender(<Probe cacheKey="topic-2" load={() => Promise.resolve(['fast'])} />);

    await waitFor(() => {
      expect(screen.getByTestId('data').textContent).toBe('["fast"]');
    });

    act(() => {
      resolveSlow(['slow']);
    });

    // The slow result belongs to a topic the user has already left.
    await waitFor(() => {
      expect(screen.getByTestId('data').textContent).toBe('["fast"]');
    });
  });

  it('shows loading again while a new dependency is in flight', async () => {
    let resolveSecond: (v: string[]) => void = () => undefined;

    const { rerender } = render(
      <Probe cacheKey="topic-1" load={() => Promise.resolve(['first'])} />,
    );
    await waitFor(() => {
      expect(status()).toBe('ready');
    });

    rerender(
      <Probe
        cacheKey="topic-2"
        load={() =>
          new Promise<string[]>((r) => {
            resolveSecond = r;
          })
        }
      />,
    );

    // The previous topic's data must not linger on screen while the next one
    // loads - that is the flash the render-phase reset exists to prevent.
    expect(status()).toBe('loading');

    act(() => {
      resolveSecond(['second']);
    });
    await waitFor(() => {
      expect(screen.getByTestId('data').textContent).toBe('["second"]');
    });
  });

  it('does not refetch while the dependency is unchanged', async () => {
    const load = vi.fn(() => Promise.resolve(['x']));
    const { rerender } = render(<Probe cacheKey="stable" load={load} />);

    await waitFor(() => {
      expect(status()).toBe('ready');
    });
    rerender(<Probe cacheKey="stable" load={load} />);
    rerender(<Probe cacheKey="stable" load={load} />);

    expect(load).toHaveBeenCalledOnce();
  });
});
