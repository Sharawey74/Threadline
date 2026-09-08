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

/**
 * I3's exit criterion is a claim about the whole workbench: usable in a plain
 * browser against fixture data. These drive it as a user would.
 */
describe('the workbench', () => {
  it('shows the checklist once the plan loads', async () => {
    render(<Workbench />);

    await waitFor(() => {
      expect(screen.getByText(/Notes track/)).toBeTruthy();
    });
    expect(screen.getAllByRole('checkbox').length).toBeGreaterThan(0);
  });

  it('asks for a topic before showing material', async () => {
    render(<Workbench />);
    // An empty rail with no explanation reads as a broken app.
    await waitFor(() => {
      expect(screen.getByText('No topic selected')).toBeTruthy();
    });
  });

  it('lists a topic\'s material once one is chosen', async () => {
    const user = userEvent.setup();
    render(<Workbench />);

    await screen.findByRole('option', { name: '06 - System Design' });
    await user.selectOptions(screen.getByRole('combobox'), '06 - System Design');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Fundamentals v3' })).toBeTruthy();
    });
  });

  it('explains an empty topic rather than showing a blank rail', async () => {
    const user = userEvent.setup();
    render(<Workbench />);

    await screen.findByRole('option', { name: '09 - AI' });
    await user.selectOptions(screen.getByRole('combobox'), '09 - AI');

    await waitFor(() => {
      expect(screen.getByText('No material in this topic')).toBeTruthy();
    });
  });

  it('ticks an item through the bridge', async () => {
    const user = userEvent.setup();
    render(<Workbench />);

    await waitFor(() => {
      expect(screen.getAllByRole('checkbox').length).toBeGreaterThan(0);
    });

    const boxes = screen.getAllByRole('checkbox');
    const target = boxes.find((b) => !(b as HTMLInputElement).checked);
    expect(target).toBeDefined();

    await user.click(target!);
    expect((target as HTMLInputElement).checked).toBe(true);
  });

  it('opens an artifact and returns to the checklist', async () => {
    const user = userEvent.setup();
    render(<Workbench />);

    await screen.findByRole('option', { name: '06 - System Design' });
    await user.selectOptions(screen.getByRole('combobox'), '06 - System Design');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Fundamentals v3' })).toBeTruthy();
    });
    await user.click(screen.getByRole('button', { name: 'Fundamentals v3' }));

    // The mock serves markdown, so the text pane renders rather than the PDF one.
    await waitFor(() => {
      expect(screen.getByText(/Fixture artifact/)).toBeTruthy();
    });

    await user.click(screen.getByRole('button', { name: 'Checklist' }));
    await waitFor(() => {
      expect(screen.getByText(/Notes track/)).toBeTruthy();
    });
  });

  it('clears the open artifact when the topic changes', async () => {
    const user = userEvent.setup();
    render(<Workbench />);

    await screen.findByRole('option', { name: '06 - System Design' });
    await user.selectOptions(screen.getByRole('combobox'), '06 - System Design');
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Fundamentals v3' })).toBeTruthy();
    });
    await user.click(screen.getByRole('button', { name: 'Fundamentals v3' }));

    await user.selectOptions(screen.getByRole('combobox'), '02 - Databases & Storage');

    // Keeping the selection would show the previous topic's document under the
    // new topic's name.
    await waitFor(() => {
      expect(screen.getByText(/Notes track/)).toBeTruthy();
    });
    expect(screen.queryByRole('button', { name: 'Fundamentals v3' })).toBeNull();
  });

  it('keeps the note box present without being summoned', async () => {
    render(<Workbench />);
    // A note you have to open is a note that does not get written.
    expect(screen.getByLabelText('Session note')).toBeTruthy();
  });

  it('does not show a running timer before sessions are recorded', async () => {
    render(<Workbench />);
    // A clock that counts but records nothing would display a number nothing
    // measured (C5). Sessions are I5.
    expect(screen.getByText('not recording yet')).toBeTruthy();
  });
});
