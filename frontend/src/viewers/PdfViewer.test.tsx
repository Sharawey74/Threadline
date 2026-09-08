import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * pdf.js is mocked, not exercised.
 *
 * jsdom has no canvas and no Web Worker, so running the real library here would
 * test the environment rather than the component. That pdf.js itself works
 * inside WebView2 was proven by the Phase 0 spike against a real 102-page file;
 * what these tests hold is the component's own behaviour — page navigation,
 * position restore, teardown, and the failure path.
 */

const renderTask = { promise: Promise.resolve(), cancel: vi.fn() };
const page = {
  getViewport: () => ({ width: 800, height: 1000 }),
  render: vi.fn(() => renderTask),
};

const destroy = vi.fn(() => Promise.resolve());
let numPages = 102;
let loadFails: Error | null = null;

vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: { workerSrc: '' },
  getDocument: vi.fn(() => ({
    promise: loadFails
      ? Promise.reject(loadFails)
      : Promise.resolve({ numPages, getPage: () => Promise.resolve(page) }),
    destroy,
  })),
}));

const { PdfViewer } = await import('./PdfViewer');

beforeEach(() => {
  numPages = 102;
  loadFails = null;
});

/** Base64 for "pdf-bytes" — the content is irrelevant, the identity is not. */
const DOC_A = 'cGRmLWJ5dGVz';
const DOC_B = 'b3RoZXItYnl0ZXM=';

describe('PdfViewer', () => {
  it('opens at the stored page rather than page one', async () => {
    render(<PdfViewer data={DOC_A} initialPage={41} title="Fundamentals v3" />);

    // The requirement the whole stack decision rested on: close at 41, reopen
    // at 41. For a 396-page curriculum read over five months this is the
    // feature, not a nicety.
    await waitFor(() => {
      expect(screen.getByText('Page 41 of 102')).toBeTruthy();
    });
  });

  it('opens at page one when nothing was stored', async () => {
    render(<PdfViewer data={DOC_A} initialPage={null} title="Fundamentals v3" />);
    await waitFor(() => {
      expect(screen.getByText('Page 1 of 102')).toBeTruthy();
    });
  });

  it('clamps a stored page beyond the end of the document', async () => {
    numPages = 20;
    render(<PdfViewer data={DOC_A} initialPage={41} title="Shorter file" />);

    // A stored position can outlive the file it points into. Opening at the
    // end is a better answer than refusing to open.
    await waitFor(() => {
      expect(screen.getByText('Page 20 of 20')).toBeTruthy();
    });
  });

  it('turns pages and reports each change', async () => {
    const onPageChange = vi.fn();
    const user = userEvent.setup();
    render(
      <PdfViewer data={DOC_A} initialPage={41} onPageChange={onPageChange} title="Doc" />,
    );

    await waitFor(() => {
      expect(screen.getByText('Page 41 of 102')).toBeTruthy();
    });

    await user.click(screen.getByRole('button', { name: 'Next page' }));
    expect(screen.getByText('Page 42 of 102')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Previous page' }));
    expect(screen.getByText('Page 41 of 102')).toBeTruthy();

    // Reported so the position survives a close.
    expect(onPageChange).toHaveBeenCalledWith(42);
  });

  it('cannot page past either end', async () => {
    numPages = 2;
    const user = userEvent.setup();
    render(<PdfViewer data={DOC_A} initialPage={1} title="Doc" />);

    await waitFor(() => {
      expect(screen.getByText('Page 1 of 2')).toBeTruthy();
    });
    expect(screen.getByRole('button', { name: 'Previous page' })).toHaveProperty('disabled', true);

    await user.click(screen.getByRole('button', { name: 'Next page' }));
    expect(screen.getByText('Page 2 of 2')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Next page' })).toHaveProperty('disabled', true);
  });

  it('shows the reason when a document will not open', async () => {
    loadFails = new Error('Invalid PDF structure');
    render(<PdfViewer data={DOC_A} initialPage={null} title="Broken.pdf" />);

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('Invalid PDF structure');
    });
    // Named, so the user knows which file failed when several are open.
    expect(screen.getByText(/Could not open Broken\.pdf/)).toBeTruthy();
  });

  it('destroys the loading task on unmount', async () => {
    destroy.mockClear();
    const { unmount } = render(<PdfViewer data={DOC_A} initialPage={null} title="Doc" />);

    await waitFor(() => {
      expect(screen.getByText('Page 1 of 102')).toBeTruthy();
    });
    unmount();

    // A viewer leaking a worker per opened PDF would breach the 300 MB target
    // after a handful of files (N3).
    expect(destroy).toHaveBeenCalled();
  });

  it('resets to the new document when the bytes change', async () => {
    const { rerender } = render(
      <PdfViewer data={DOC_A} initialPage={41} title="First" />,
    );
    await waitFor(() => {
      expect(screen.getByText('Page 41 of 102')).toBeTruthy();
    });

    numPages = 30;
    rerender(<PdfViewer data={DOC_B} initialPage={5} title="Second" />);

    // The previous document's page must not linger under the new one's counter.
    await waitFor(() => {
      expect(screen.getByText('Page 5 of 30')).toBeTruthy();
    });
  });

  it('gives the canvas an accessible name carrying the page', async () => {
    render(<PdfViewer data={DOC_A} initialPage={41} title="Fundamentals v3" />);
    await waitFor(() => {
      expect(screen.getByLabelText('Fundamentals v3, page 41')).toBeTruthy();
    });
  });
});
