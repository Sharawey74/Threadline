import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Layout } from './Layout';

function renderLayout() {
  return render(
    <Layout
      header={<span>header content</span>}
      material={<span>material content</span>}
      progress={<span>progress content</span>}
      session={<span>session content</span>}
      note={<textarea aria-label="Session note" />}
      viewer={<span>viewer content</span>}
    />,
  );
}

describe('Layout', () => {
  it('renders every region it was given', () => {
    renderLayout();
    for (const text of [
      'header content',
      'material content',
      'progress content',
      'session content',
      'viewer content',
    ]) {
      expect(screen.getByText(text)).toBeTruthy();
    }
  });

  it('labels the rail regions as headings', () => {
    renderLayout();
    // Real headings, not styled text: the rail should be navigable by screen
    // reader and by heading-jump shortcuts.
    const headings = screen.getAllByRole('heading', { level: 2 });
    expect(headings.map((h) => h.textContent)).toEqual([
      'Material',
      'Topic',
      'Session',
    ]);
  });

  it('gives the viewer an accessible name', () => {
    renderLayout();
    expect(screen.getByRole('main', { name: 'Viewer' })).toBeTruthy();
  });

  it('keeps the note box in the frame rather than behind a control', () => {
    renderLayout();
    // The note must always be visible. A note you have to summon is a note
    // that does not get written, and homework is the named failure mode.
    const note = screen.getByLabelText('Session note');
    expect(note).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('button', { name: /note/i })).toBeNull();
  });

  it('renders the note outside the scrolling material region', () => {
    const { container } = renderLayout();
    const material = container.querySelector('.wb-rail-material');
    const note = screen.getByLabelText('Session note');

    // A long material list must not be able to push the note off screen.
    expect(material?.contains(note)).toBe(false);
  });
});
