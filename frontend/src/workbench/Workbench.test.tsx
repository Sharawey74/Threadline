import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { setIPC } from '../ipc';
import { MockIPC } from '../ipc/mock';

// pdf.js cannot run in jsdom. The viewer has its own tests; here it only needs
// to prove it is reached.
vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: { workerSrc: '' },
  getDocument: () => ({
    promise: Promise.resolve({
      numPages: 31,
      getPage: () =>
        Promise.resolve({
          getViewport: () => ({ width: 100, height: 100 }),
          render: () => ({ promise: Promise.resolve(), cancel: vi.fn() }),
        }),
    }),
    destroy: vi.fn(),
  }),
}));

const { Workbench } = await import('./Workbench');

beforeEach(() => {
  setIPC(new MockIPC());
});

/** Waits for the material rail to finish its first read. */
async function railReady() {
  await waitFor(() => {
    expect(screen.getByRole('button', { name: /06 - System Design/ })).toBeTruthy();
  });
}

describe('the workbench', () => {
  it('shows the checklist once the plan loads', async () => {
    render(<Workbench />);

    await waitFor(() => {
      expect(screen.getByText(/Notes track/)).toBeTruthy();
    });
    expect(screen.getAllByRole('checkbox').length).toBeGreaterThan(0);
  });

  describe('the material rail', () => {
    // The rail used to show one topic at a time behind a select, which threw
    // away the folder structure the files already have on disk.
    it('lists every topic without one having to be chosen first', async () => {
      render(<Workbench />);
      await railReady();

      for (const slug of ['02 - Databases & Storage', '06 - System Design', '09 - AI']) {
        expect(screen.getByRole('button', { name: new RegExp(slug) })).toBeTruthy();
      }
    });

    it('counts each folder from the files it actually read', async () => {
      render(<Workbench />);
      await railReady();

      // Measured, not declared: no field on Topic carries a count, so a number
      // here could only have come from reading the list (C5).
      expect(screen.getByRole('button', { name: '06 - System Design, 3 files' })).toBeTruthy();
      expect(screen.getByRole('button', { name: '02 - Databases & Storage, 1 file' })).toBeTruthy();
      expect(screen.getByRole('button', { name: '09 - AI, 0 files' })).toBeTruthy();
    });

    it('filters across every topic at once', async () => {
      const user = userEvent.setup();
      render(<Workbench />);
      await railReady();

      await user.type(screen.getByLabelText('Filter material'), 'ACID');

      expect(screen.getByRole('button', { name: /ACID/ })).toBeTruthy();
      // A topic with no match disappears rather than sitting there empty.
      expect(screen.queryByRole('button', { name: /09 - AI/ })).toBeNull();
    });
  });

  describe('tabs', () => {
    it('opens a document from the rail', async () => {
      const user = userEvent.setup();
      render(<Workbench />);
      await railReady();

      await user.click(screen.getByRole('button', { name: /Fundamentals v3/ }));

      expect(screen.getByRole('tab', { name: /Fundamentals v3/ })).toBeTruthy();
    });

    // The whole reason tabs exist: comparing a plan item against the document
    // it points at used to mean closing one to see the other.
    it('keeps the first document open when a second is opened', async () => {
      const user = userEvent.setup();
      render(<Workbench />);
      await railReady();

      await user.click(screen.getByRole('button', { name: /Fundamentals v3/ }));
      await user.click(screen.getByRole('button', { name: /My notes/ }));

      expect(screen.getByRole('tab', { name: /Fundamentals v3/ })).toBeTruthy();
      expect(screen.getByRole('tab', { name: /My notes/ })).toBeTruthy();
    });

    it('closes one document and leaves the other open', async () => {
      const user = userEvent.setup();
      render(<Workbench />);
      await railReady();

      await user.click(screen.getByRole('button', { name: /Fundamentals v3/ }));
      await user.click(screen.getByRole('button', { name: /My notes/ }));
      await user.click(screen.getByRole('button', { name: 'Close Fundamentals v3' }));

      expect(screen.queryByRole('tab', { name: /Fundamentals v3/ })).toBeNull();
      expect(screen.getByRole('tab', { name: /My notes/ })).toBeTruthy();
    });
  });

  describe('the status bar', () => {
    // Reconciliation ran on every scan from I1 and nothing showed it. The
    // checks were bound, typed, tested, and called by nobody.
    it('surfaces a failing check rather than computing it and staying silent', async () => {
      render(<Workbench />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /1 check fails/ })).toBeTruthy();
      });
      // Naming the failing check often saves the trip to go and look.
      expect(screen.getByText(/Now -> Sun 30 Aug tasks vs heading/)).toBeTruthy();
    });

    it('says it is still checking rather than claiming everything passes', () => {
      render(<Workbench />);

      // Null is "not read yet", which is not "nothing is wrong". A reassuring
      // tick before the answer arrives is exactly the unmeasured claim C5 bans.
      expect(screen.getByText('Checking the plan…')).toBeTruthy();
    });
  });

  it('keeps the note box present without being summoned', async () => {
    render(<Workbench />);

    await waitFor(() => {
      expect(screen.getByLabelText('Session note')).toBeTruthy();
    });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('does not show a running timer before sessions are recorded', async () => {
    render(<Workbench />);
    await waitFor(() => {
      expect(screen.getByText(/Notes track/)).toBeTruthy();
    });

    // Sessions are I5. A timer that counted but recorded nothing would put a
    // number on screen that nothing measured.
    expect(screen.queryByText(/\d+:\d\d/)).toBeNull();
  });

  it('collapses both side panes in reading mode', async () => {
    const user = userEvent.setup();
    render(<Workbench />);
    await railReady();

    await user.click(
      screen.getByRole('button', { name: /Reading mode: collapse both side panes/ }),
    );

    expect(screen.queryByRole('complementary', { name: 'Material' })).toBeNull();
    expect(screen.queryByRole('complementary', { name: 'Plan' })).toBeNull();
    expect(screen.getByRole('main', { name: 'Viewer' })).toBeTruthy();
  });
});
