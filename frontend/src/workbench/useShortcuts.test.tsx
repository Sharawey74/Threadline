import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { useShortcuts } from './useShortcuts';

function Harness({ shortcuts }: { shortcuts: Record<string, () => void> }) {
  useShortcuts(shortcuts);
  return (
    <div>
      <textarea aria-label="Session note" />
      <input aria-label="Search" />
      <button type="button">elsewhere</button>
    </div>
  );
}

describe('useShortcuts', () => {
  it('fires a bare-letter shortcut', async () => {
    const t = vi.fn();
    render(<Harness shortcuts={{ t }} />);

    await userEvent.setup().keyboard('t');
    expect(t).toHaveBeenCalledOnce();
  });

  it('fires a modifier combination', async () => {
    const save = vi.fn();
    render(<Harness shortcuts={{ 'mod+s': save }} />);

    await userEvent.setup().keyboard('{Control>}s{/Control}');
    expect(save).toHaveBeenCalledOnce();
  });

  it('does not fire while typing in the note box', async () => {
    const t = vi.fn();
    const user = userEvent.setup();
    render(<Harness shortcuts={{ t }} />);

    await user.click(screen.getByLabelText('Session note'));
    await user.keyboard('this task took two hours');

    // The note box is always focused and always present. A bare-letter
    // shortcut that stole keystrokes would make it unusable - and the note
    // box is what the whole anti-homework design rests on.
    expect(t).not.toHaveBeenCalled();
    expect((screen.getByLabelText('Session note') as HTMLTextAreaElement).value).toBe(
      'this task took two hours',
    );
  });

  it('does not fire while typing in a text input', async () => {
    const t = vi.fn();
    const user = userEvent.setup();
    render(<Harness shortcuts={{ t }} />);

    await user.click(screen.getByLabelText('Search'));
    await user.keyboard('threadline');

    expect(t).not.toHaveBeenCalled();
  });

  it('ignores keys nothing is bound to', async () => {
    const t = vi.fn();
    render(<Harness shortcuts={{ t }} />);

    await userEvent.setup().keyboard('q');
    expect(t).not.toHaveBeenCalled();
  });

  it('unbinds on unmount', async () => {
    const t = vi.fn();
    const { unmount } = render(<Harness shortcuts={{ t }} />);

    unmount();
    await userEvent.setup().keyboard('t');

    expect(t).not.toHaveBeenCalled();
  });

  // The note box is always present and often focused, so a palette that could
  // not be opened from inside it would be unreachable exactly when it is most
  // wanted. mod+k in a text field is not someone typing "k".
  it('fires a modifier combination even while typing in the note box', async () => {
    const palette = vi.fn();
    render(<Harness shortcuts={{ 'mod+k': palette }} />);

    const user = userEvent.setup();
    await user.click(screen.getByLabelText('Session note'));
    await user.keyboard('{Control>}k{/Control}');

    expect(palette).toHaveBeenCalledOnce();
  });

  it('still ignores a bare letter typed into a text input', async () => {
    const t = vi.fn();
    render(<Harness shortcuts={{ t }} />);

    const user = userEvent.setup();
    await user.click(screen.getByLabelText('Search'));
    await user.keyboard('t');

    expect(t).not.toHaveBeenCalled();
  });
});
