import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import type { Destination } from './IconRail';
import { IconRail } from './IconRail';

function Harness() {
  const [active, setActive] = useState<Destination>('home');
  return <IconRail active={active} onNavigate={setActive} />;
}

describe('the icon rail', () => {
  // By accessible name, the name a screen reader announces - not textContent,
  // which an aria-label or an aria-hidden label would silently diverge from.
  it('lists the five destinations in order', () => {
    render(<Harness />);

    const rail = screen.getByRole('navigation', { name: 'Destinations' });
    const buttons = within(rail).getAllByRole('button');
    expect(buttons).toHaveLength(5);
    ['Home', 'Files', 'Plan', 'Notes', 'Settings'].forEach((name, i) => {
      expect(
        within(rail).getByRole('button', { name }),
        `button ${i + 1} is not named ${name}`,
      ).toBe(buttons[i]);
    });
  });

  it('marks only the active destination', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: 'Plan' }));

    const current = screen
      .getAllByRole('button')
      .filter((b) => b.getAttribute('aria-current') === 'page');
    expect(current.map((b) => b.textContent)).toEqual(['Plan']);
  });
});
