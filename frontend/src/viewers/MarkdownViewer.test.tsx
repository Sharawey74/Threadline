import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

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

  it('starts in preview and switches to source when read-only', async () => {
    const user = userEvent.setup();
    render(<MarkdownViewer source={SOURCE} title="TASKS.md" readOnly />);

    expect(screen.getByLabelText('TASKS.md, preview')).toBeTruthy();
    expect(screen.queryByLabelText('TASKS.md, source')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Source' }));

    expect(screen.getByLabelText('TASKS.md, source')).toBeTruthy();
    expect(screen.queryByLabelText('TASKS.md, preview')).toBeNull();
  });

  it('shows both panes in split mode', async () => {
    const user = userEvent.setup();
    render(<MarkdownViewer source={SOURCE} title="notes.md" onSave={async () => undefined} />);

    await user.click(screen.getByRole('button', { name: 'Split' }));

    expect(screen.getByLabelText('notes.md, preview')).toBeTruthy();
    expect(screen.getByLabelText('notes.md, editor')).toBeTruthy();
  });

  it('marks the active mode for assistive technology', async () => {
    const user = userEvent.setup();
    render(<MarkdownViewer source={SOURCE} title="notes.md" onSave={async () => undefined} />);

    expect(screen.getByRole('button', { name: 'Preview' }).getAttribute('aria-pressed')).toBe(
      'true',
    );

    await user.click(screen.getByRole('button', { name: 'Split' }));
    expect(screen.getByRole('button', { name: 'Split' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('shows the source exactly as written, markup included', async () => {
    const user = userEvent.setup();
    render(<MarkdownViewer source={SOURCE} title="TASKS.md" readOnly />);

    await user.click(screen.getByRole('button', { name: 'Source' }));

    // Source mode exists so the user can see what the parser sees. Rendering
    // it would defeat the point.
    expect(screen.getByLabelText('TASKS.md, source').textContent).toContain(
      '- [ ] **1. `02 - Databases`**',
    );
  });

  it('withholds the editor for the plan file and says why', async () => {
    const user = userEvent.setup();
    render(
      <MarkdownViewer
        source={SOURCE}
        title="TASKS.md"
        readOnly
        readOnlyReason="The plan file changes only by ticking a checkbox."
      />,
    );

    // The plan file changes through one path - a tick spliced byte-exactly
    // (C3) - because a full rewrite cannot promise nothing else moved.
    await user.click(screen.getByRole('button', { name: 'Source' }));
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.getByText(/only by ticking a checkbox/)).toBeTruthy();
    // Calling a read-only pane "Edit" would promise something it does not do.
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
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

describe('editing', () => {
  const editable = { title: 'notes.md', source: '# Notes\n\noriginal text\n' };

  it('offers an editor when the file can be saved', () => {
    render(
      <MarkdownViewer {...editable} onSave={async () => undefined} initialMode="edit" />,
    );
    expect(screen.getByLabelText('notes.md, editor')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeTruthy();
  });

  it('marks the draft unsaved as soon as it differs', async () => {
    const user = userEvent.setup();
    render(
      <MarkdownViewer {...editable} onSave={async () => undefined} initialMode="edit" />,
    );

    expect(screen.queryByText('unsaved')).toBeNull();
    await user.type(screen.getByLabelText('notes.md, editor'), ' more');
    expect(screen.getByText('unsaved')).toBeTruthy();
  });

  it('cannot save when nothing changed', () => {
    render(
      <MarkdownViewer {...editable} onSave={async () => undefined} initialMode="edit" />,
    );
    expect(screen.getByRole('button', { name: 'Save' })).toHaveProperty('disabled', true);
  });

  it('saves the draft through the bridge', async () => {
    const onSave = vi.fn(async () => undefined);
    const user = userEvent.setup();
    render(<MarkdownViewer {...editable} onSave={onSave} initialMode="edit" />);

    await user.type(screen.getByLabelText('notes.md, editor'), '!');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSave).toHaveBeenCalledWith('# Notes\n\noriginal text\n!');
  });

  it('keeps the draft and says why when a save fails', async () => {
    const onSave = vi.fn(() => Promise.reject(new Error('disk is full')));
    const user = userEvent.setup();
    render(<MarkdownViewer {...editable} onSave={onSave} initialMode="edit" />);

    await user.type(screen.getByLabelText('notes.md, editor'), '!');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('disk is full');
    });
    // Discarding the user's text because the write failed would be the worst
    // possible response to a failed write.
    expect((screen.getByLabelText('notes.md, editor') as HTMLTextAreaElement).value).toContain('!');
    expect(screen.getByText('unsaved')).toBeTruthy();
  });

  it('previews the draft rather than the saved text in split mode', async () => {
    const user = userEvent.setup();
    render(
      <MarkdownViewer
        title="notes.md"
        source="# Original"
        onSave={async () => undefined}
        initialMode="split"
      />,
    );

    const editor = screen.getByLabelText('notes.md, editor');
    await user.clear(editor);
    await user.type(editor, '# Edited');

    // Split exists to see the result while typing. Previewing the saved text
    // would make it useless.
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Edited' })).toBeTruthy();
    });
  });

  it('discards the draft when a different file is opened', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <MarkdownViewer
        title="a.md"
        source="# A"
        onSave={async () => undefined}
        initialMode="edit"
      />,
    );

    await user.type(screen.getByLabelText('a.md, editor'), ' edited');
    rerender(
      <MarkdownViewer
        title="b.md"
        source="# B"
        onSave={async () => undefined}
        initialMode="edit"
      />,
    );

    // Carrying a draft into another file would risk saving A's text over B.
    expect((screen.getByLabelText('b.md, editor') as HTMLTextAreaElement).value).toBe('# B');
    expect(screen.queryByText('unsaved')).toBeNull();
  });

  it('withholds the editor when no save handler exists', () => {
    render(<MarkdownViewer {...editable} initialMode="edit" />);
    // No save path means no editor: a textarea whose contents go nowhere is
    // worse than none.
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.getByRole('button', { name: 'Source' })).toBeTruthy();
  });
});
