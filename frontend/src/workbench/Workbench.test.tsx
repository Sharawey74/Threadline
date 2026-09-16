import { render, screen, waitFor, within } from '@testing-library/react';
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

const NAMES = ['aria-label', 'aria-labelledby', 'title', 'alt'];
/** Elements that draw something themselves, so a name on them is content. */
const CONTROLS =
  'button, a[href], img, [role="button"], [role="link"], [role="img"], [role="tab"], [role="checkbox"]';
const FIELDS = 'input, select, textarea';
/** Known spacers: they draw nothing and hold a flex slot open. */
const SPACERS = '.sh-grow, .sb-sep, .sb-spacer, ul.ex-files:empty';

/**
 * A named control or a field. A name on a container only labels what is
 * inside it, so an empty named strip draws nothing and does not count.
 */
function draws(el: Element): boolean {
  const named = NAMES.some((name) => (el.getAttribute(name) ?? '').trim() !== '');
  return (el.matches(CONTROLS) && named) || el.matches(FIELDS);
}

/**
 * True if the element shows text, is part of a drawing, is a named control or
 * a field, holds one, or is a listed spacer. An icon alone does not make its
 * container count.
 */
function hasContent(el: Element): boolean {
  return (
    (el.textContent ?? '').trim() !== '' ||
    el.closest('svg') !== null ||
    el.matches(SPACERS) ||
    draws(el) ||
    [...el.querySelectorAll('*')].some(draws)
  );
}

/** Opens a destination from the icon rail. */
async function goTo(user: ReturnType<typeof userEvent.setup>, name: string) {
  const rail = screen.getByRole('navigation', { name: 'Destinations' });
  await user.click(within(rail).getByRole('button', { name }));
}

/** Waits for the material rail to finish its first read. */
async function railReady() {
  await waitFor(() => {
    expect(screen.getByRole('button', { name: /06 - System Design/ })).toBeTruthy();
  });
}

describe('the workbench', () => {
  it('shows the checklist once the plan loads', async () => {
    const user = userEvent.setup();
    render(<Workbench />);
    await railReady();
    await goTo(user, 'Plan');

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
    const user = userEvent.setup();
    render(<Workbench />);
    await railReady();
    await goTo(user, 'Plan');

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
    await goTo(user, 'Plan');

    expect(await screen.findByRole('textbox', { name: 'Note' })).toBeTruthy();
    expectNoSessionWording();

    await goTo(user, 'Settings');
    // Without this the second check could pass against a Settings pane that
    // never opened.
    expect(screen.getByRole('heading', { name: 'Settings', level: 1 })).toBeTruthy();
    expectNoSessionWording();
  });

  it('collapses the material rail in reading mode', async () => {
    const user = userEvent.setup();
    render(<Workbench />);
    await railReady();

    await user.click(
      screen.getByRole('button', { name: /Reading mode: collapse the material rail/ }),
    );

    expect(screen.queryByRole('complementary', { name: 'Material' })).toBeNull();
    expect(screen.getByRole('main', { name: 'Files' })).toBeTruthy();
  });

  describe('the shell', () => {
    it('renders the title bar, the icon rail and a main region', async () => {
      render(<Workbench />);
      await railReady();

      expect(screen.getByRole('banner')).toBeTruthy();
      expect(screen.getByRole('group', { name: 'Window' })).toBeTruthy();
      expect(screen.getByRole('navigation', { name: 'Destinations' })).toBeTruthy();
      expect(screen.getByRole('main', { name: 'Files' })).toBeTruthy();
    });

    // Issue #1: the launch state drew 40px of empty tab row and a 52px header
    // naming no document above an empty viewer.
    it('draws no tab row and no document header with nothing open', async () => {
      render(<Workbench />);
      await railReady();

      expect(screen.queryByRole('tablist')).toBeNull();

      // The whole screen, not two levels of it. Every element must belong to a
      // landmark (title bar, destinations, material rail, status line), be the
      // empty state or inside it, or be an ancestor holding the empty state. A
      // band drawn anywhere else - in the shell, the viewer, before the frame -
      // is none of those.
      const empty = screen.getByText('Nothing open').parentElement!;
      const regions = [
        screen.getByRole('banner'),
        screen.getByRole('navigation', { name: 'Destinations' }),
        screen.getByRole('complementary', { name: 'Material' }),
        screen.getByRole('contentinfo'),
        empty,
      ];
      const stray = [...document.body.querySelectorAll('*')].filter(
        (el) => !regions.some((r) => r.contains(el)) && !el.contains(empty),
      );
      expect(stray.map((el) => el.outerHTML.slice(0, 80))).toEqual([]);

      // Inside those regions too: a band needs no content to take up a row.
      // Every element must carry something - text, a name, a drawing, a field -
      // or hold something that does, or be a spacer on the list below. The list
      // is default-deny: a new spacer is added here on purpose. jsdom does no
      // layout, so dead space made by padding or a pseudo-element is out of reach.
      const blank = [...document.body.querySelectorAll('*')].filter((el) => !hasContent(el));
      expect(blank.map((el) => el.outerHTML.slice(0, 80))).toEqual([]);
    });

    // Issue #2: at 400px beside a document, plan items wrapped to five lines.
    it('shows the checklist under Plan and keeps no plan pane beside Files', async () => {
      const user = userEvent.setup();
      render(<Workbench />);
      await railReady();

      expect(screen.queryByRole('complementary', { name: 'Plan' })).toBeNull();
      expect(screen.queryAllByRole('checkbox')).toHaveLength(0);

      await goTo(user, 'Plan');

      const main = screen.getByRole('main', { name: 'Plan' });
      await waitFor(() => {
        expect(within(main).getAllByRole('checkbox').length).toBeGreaterThan(0);
      });
    });
  });

  describe('settings', () => {
    // The career folder could be chosen on first run and never changed again.
    // chooseCareerRoot was bound; nothing after first run called it.
    it('opens settings and offers to change the career folder', async () => {
      const user = userEvent.setup();
      render(<Workbench />);
      await railReady();

      await goTo(user, 'Settings');

      expect(screen.getByRole('heading', { name: 'Settings', level: 1 })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Change…' })).toBeTruthy();
    });

    it('goes back to Files', async () => {
      const user = userEvent.setup();
      render(<Workbench />);
      await railReady();

      await goTo(user, 'Settings');
      await goTo(user, 'Files');

      expect(screen.queryByRole('heading', { name: 'Settings', level: 1 })).toBeNull();
      expect(screen.getByRole('main', { name: 'Files' })).toBeTruthy();
    });

    // Settings is a destination, so leaving Files for it and coming back must
    // not cost the documents that were open.
    it('keeps the open documents across a visit to settings', async () => {
      const user = userEvent.setup();
      render(<Workbench />);
      await railReady();

      await user.click(screen.getByRole('button', { name: /My notes/ }));
      await goTo(user, 'Settings');
      await goTo(user, 'Files');

      expect(screen.getByRole('tab', { name: /My notes/ })).toBeTruthy();
    });
  });
});
