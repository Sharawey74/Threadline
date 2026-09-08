import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Layout } from './Layout';

function renderLayout(props: { railCollapsed?: boolean; planCollapsed?: boolean } = {}) {
  return render(
    <Layout
      title={<span>title content</span>}
      tabs={<span>tabs content</span>}
      document={<span>document content</span>}
      rail={<span>rail content</span>}
      viewer={<span>viewer content</span>}
      plan={<textarea aria-label="Session note" />}
      status={<span>status content</span>}
      {...props}
    />,
  );
}

describe('Layout', () => {
  it('renders every region it was given', () => {
    renderLayout();
    for (const text of [
      'title content',
      'tabs content',
      'document content',
      'rail content',
      'viewer content',
      'status content',
    ]) {
      expect(screen.getByText(text)).toBeTruthy();
    }
  });

  it('names the three regions a screen reader has to tell apart', () => {
    renderLayout();
    expect(screen.getByRole('main', { name: 'Viewer' })).toBeTruthy();
    expect(screen.getByRole('complementary', { name: 'Material' })).toBeTruthy();
    expect(screen.getByRole('complementary', { name: 'Plan' })).toBeTruthy();
  });

  // Reading a document and ticking the item it belongs to is the product.
  // While the plan was a destination rather than a pane, doing both at once
  // was impossible - which rebuilt the four-app problem one level down.
  it('shows the plan beside the viewer rather than instead of it', () => {
    renderLayout();
    expect(screen.getByRole('main', { name: 'Viewer' })).toBeTruthy();
    expect(screen.getByLabelText('Session note')).toBeTruthy();
  });

  describe('reading mode', () => {
    it('hides a collapsed pane from assistive technology', () => {
      renderLayout({ railCollapsed: true });

      // A pane animated to zero width is still in the accessibility tree and
      // still focusable unless it is taken out of both, and then Tab appears
      // to jump into nothing.
      expect(screen.queryByRole('complementary', { name: 'Material' })).toBeNull();
      expect(screen.getByRole('complementary', { name: 'Plan' })).toBeTruthy();
    });

    it('collapses both panes independently', () => {
      renderLayout({ railCollapsed: true, planCollapsed: true });

      expect(screen.queryByRole('complementary', { name: 'Material' })).toBeNull();
      expect(screen.queryByRole('complementary', { name: 'Plan' })).toBeNull();
      // The viewer is the point of reading mode and never collapses.
      expect(screen.getByRole('main', { name: 'Viewer' })).toBeTruthy();
    });

    it('keeps a collapsed pane mounted so it does not lose its scroll position', () => {
      const { container } = renderLayout({ railCollapsed: true });

      // Width animates; the pane is not unmounted. Coming out of reading mode
      // should put the rail back where it was, not at the top.
      const rail = container.querySelector('.wb-rail-shut');
      expect(rail).not.toBeNull();
      expect(rail?.textContent).toBe('rail content');
    });
  });
});
