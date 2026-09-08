import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { AsyncState } from '../hooks/useAsync';
import { AsyncView } from './States';

function view(state: AsyncState<string[]>, onRender = (d: string[]) => <p>{d.join(', ')}</p>) {
  return render(
    <AsyncView
      state={state}
      loadingLabel="Loading material"
      errorTitle="Could not load material"
      emptyTitle="No material in this topic"
      emptyHint="Add a PDF to the topic folder."
    >
      {onRender}
    </AsyncView>,
  );
}

describe('AsyncView', () => {
  it('announces loading to assistive technology', () => {
    view({ status: 'loading' });
    expect(screen.getByRole('status').textContent).toBe('Loading material');
  });

  it('shows the real error message, not a generic one', () => {
    view({
      status: 'error',
      error: new Error('plan file changed on disk since it was read'),
      retry: vi.fn(),
    });

    const alert = screen.getByRole('alert');
    // "Something went wrong" tells the user nothing and trains them to ignore
    // errors. The backend writes messages a person can act on; show them.
    expect(alert.textContent).toContain('plan file changed on disk since it was read');
    expect(alert.textContent).not.toContain('Something went wrong');
  });

  it('offers a retry that calls back', async () => {
    const retry = vi.fn();
    view({ status: 'error', error: new Error('boom'), retry });

    await userEvent.setup().click(screen.getByRole('button', { name: /try again/i }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it('explains an empty state rather than rendering a blank panel', () => {
    view({ status: 'empty' });
    // A blank panel reads as a broken app.
    expect(screen.getByText('No material in this topic')).toBeTruthy();
    expect(screen.getByText('Add a PDF to the topic folder.')).toBeTruthy();
  });

  it('renders children only when data is loaded and non-empty', () => {
    const child = vi.fn((d: string[]) => <p>{d.join(', ')}</p>);
    view({ status: 'ready', data: ['ACID.pdf', 'Redis.pdf'] }, child);

    expect(screen.getByText('ACID.pdf, Redis.pdf')).toBeTruthy();
    expect(child).toHaveBeenCalledWith(['ACID.pdf', 'Redis.pdf']);
  });

  it('never calls children for a non-ready state', () => {
    const child = vi.fn(() => <p>should not render</p>);
    view({ status: 'loading' }, child);
    view({ status: 'empty' }, child);

    // The children function only ever sees loaded, non-empty data, so a pane
    // never has to guard against undefined.
    expect(child).not.toHaveBeenCalled();
  });
});
