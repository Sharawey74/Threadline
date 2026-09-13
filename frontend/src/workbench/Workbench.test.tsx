import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { setIPC } from '../ipc';
import { MockIPC } from '../ipc/mock';

import { Workbench } from './Workbench';

beforeEach(() => {
  setIPC(new MockIPC());
});

/**
 * Fails on "session" anywhere a user could read or hear it, and on an elapsed
 * time such as 24:18 - the figure a session timer would put on screen (C5).
 */
function expectNoSessionWording() {
  expect(document.body.textContent).not.toMatch(/session/i);
  expect(document.body.textContent).not.toMatch(/\d+:\d\d/);
  for (const el of document.querySelectorAll('[aria-label], [title], [placeholder]')) {
    for (const attr of ['aria-label', 'title', 'placeholder']) {
      expect(el.getAttribute(attr) ?? '').not.toMatch(/session/i);
    }
  }
}

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

    // Threadline renders no PDF (9 Sep 2026). Opening one must not read it
    // either: the bytes would cross the bridge to be thrown away. Nothing
    // launches Edge yet (Phase 8), so the pane must not claim that it does.
    it('does not render or read a PDF', async () => {
      const mock = new MockIPC();
      const read = vi.spyOn(mock, 'readArtifact');
      setIPC(mock);
      const user = userEvent.setup();
      render(<Workbench />);
      await railReady();

      await user.click(screen.getByRole('button', { name: /Fundamentals v3/ }));

      expect(screen.getByText('Fundamentals v3 is a PDF')).toBeTruthy();
      expect(screen.queryByText(/opens in Edge/)).toBeNull();
      expect(read).not.toHaveBeenCalled();
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
      expect(screen.getByRole('textbox', { name: 'Note' })).toBeTruthy();
    });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  // Sessions were deleted on 9 Sep 2026, not deferred. A label still saying
  // "session" would promise the user a record that nothing keeps.
  it('the note box carries no session framing', async () => {
    const user = userEvent.setup();
    render(<Workbench />);
    await railReady();

    expect(screen.getByRole('textbox', { name: 'Note' })).toBeTruthy();
    expectNoSessionWording();

    await user.click(screen.getByRole('button', { name: 'Settings' }));
    // Without this the second check could pass against a Settings pane that
    // never opened.
    expect(screen.getByRole('heading', { name: 'Settings', level: 1 })).toBeTruthy();
    expectNoSessionWording();
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

  describe('settings', () => {
    // The career folder could be chosen on first run and never changed again.
    // chooseCareerRoot was bound; nothing after first run called it.
    it('opens settings and offers to change the career folder', async () => {
      const user = userEvent.setup();
      render(<Workbench />);
      await railReady();

      await user.click(screen.getByRole('button', { name: 'Settings' }));

      expect(screen.getByRole('heading', { name: 'Settings', level: 1 })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Change…' })).toBeTruthy();
    });

    it('goes back to the workbench', async () => {
      const user = userEvent.setup();
      render(<Workbench />);
      await railReady();

      await user.click(screen.getByRole('button', { name: 'Settings' }));
      await user.click(screen.getByRole('button', { name: 'Back to the workbench' }));

      expect(screen.queryByRole('heading', { name: 'Settings', level: 1 })).toBeNull();
    });

    // The rail and the plan stay put. Settings replaces the document being
    // read, not the whole window, so coming back does not cost the tabs.
    it('keeps the rail and the plan while settings is open', async () => {
      const user = userEvent.setup();
      render(<Workbench />);
      await railReady();

      await user.click(screen.getByRole('button', { name: 'Settings' }));

      expect(screen.getByRole('complementary', { name: 'Material' })).toBeTruthy();
      expect(screen.getByRole('complementary', { name: 'Plan' })).toBeTruthy();
    });
  });
});
