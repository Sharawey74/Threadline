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
  it('lists the five destinations in order', () => {
    render(<Harness />);

    const rail = screen.getByRole('navigation', { name: 'Destinations' });
    expect(
      within(rail)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Home', 'Files', 'Plan', 'Notes', 'Settings']);
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
