import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { MarkdownViewer } from './MarkdownViewer';
import { renderMarkdown } from './markdown';

const SOURCE = [
  '# Career plan',
  '',
  '| Track | Hours |',
  '|---|---|',
  '| Study guide | **81** |',
  '| Total | **292** |',
  '',
  '- [ ] **1. `02 - Databases`** — 49pp, ~7h',
  '- [x] Done already',
].join('\n');

describe('MarkdownViewer', () => {
  it('renders headings and paragraphs', () => {
    render(<MarkdownViewer source={SOURCE} title="TASKS.md" />);
    expect(screen.getByRole('heading', { name: 'Career plan' })).toBeTruthy();
  });

  it('renders tables, which the plan file uses throughout', () => {
    render(<MarkdownViewer source={SOURCE} title="TASKS.md" />);
    // F6 names tables explicitly: the budget figures live in one.
    expect(screen.getByRole('table')).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: 'Hours' })).toBeTruthy();
    expect(screen.getByRole('cell', { name: '292' })).toBeTruthy();
  });

  it('renders task list checkboxes', () => {
    render(<MarkdownViewer source={SOURCE} title="TASKS.md" />);
    const boxes = screen.getAllByRole('checkbox');
    expect(boxes).toHaveLength(2);
    expect((boxes[1] as HTMLInputElement).checked).toBe(true);
  });

  it('starts rendered and switches to source', async () => {
    const user = userEvent.setup();
    render(<MarkdownViewer source={SOURCE} title="TASKS.md" />);

    expect(screen.getByLabelText('TASKS.md, rendered')).toBeTruthy();
    expect(screen.queryByLabelText('TASKS.md, source')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Source' }));

    expect(screen.getByLabelText('TASKS.md, source')).toBeTruthy();
    expect(screen.queryByLabelText('TASKS.md, rendered')).toBeNull();
  });

  it('shows both panes in split mode', async () => {
    const user = userEvent.setup();
    render(<MarkdownViewer source={SOURCE} title="TASKS.md" />);

    await user.click(screen.getByRole('button', { name: 'Split' }));

    expect(screen.getByLabelText('TASKS.md, rendered')).toBeTruthy();
    expect(screen.getByLabelText('TASKS.md, source')).toBeTruthy();
  });

  it('marks the active mode for assistive technology', async () => {
    const user = userEvent.setup();
    render(<MarkdownViewer source={SOURCE} title="TASKS.md" />);

    expect(screen.getByRole('button', { name: 'Rendered' }).getAttribute('aria-pressed')).toBe(
      'true',
    );

    await user.click(screen.getByRole('button', { name: 'Split' }));
    expect(screen.getByRole('button', { name: 'Split' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('shows the source exactly as written, markup included', async () => {
    const user = userEvent.setup();
    render(<MarkdownViewer source={SOURCE} title="TASKS.md" />);

    await user.click(screen.getByRole('button', { name: 'Source' }));

    // Source mode exists so the user can see what the parser sees. Rendering
    // it would defeat the point.
    expect(screen.getByLabelText('TASKS.md, source').textContent).toContain(
      '- [ ] **1. `02 - Databases`**',
    );
  });

  it('offers no editor, because V0 has no save path for markdown', () => {
    render(<MarkdownViewer source={SOURCE} title="TASKS.md" />);

    // A textarea whose contents are silently discarded is worse than no
    // textarea. V0 writes exactly one thing: a checkbox, through the
    // byte-exact path (C3).
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('button', { name: /edit/i })).toBeNull();
  });
});

describe('renderMarkdown', () => {
  it('strips script tags', () => {
    const html = renderMarkdown('Hello <script>alert(1)</script> world');
    expect(html).not.toContain('<script>');
    expect(html).toContain('Hello');
  });

  it('strips inline event handlers', () => {
    const html = renderMarkdown('<img src="x" onerror="alert(1)">');
    expect(html).not.toContain('onerror');
  });

  it('keeps ordinary formatting intact', () => {
    const html = renderMarkdown('**bold** and `code`');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<code>code</code>');
  });
});
