import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Shell } from './Shell';

describe('the shell frame', () => {
  it('renders the title bar, the rail, a named main region and the status line', () => {
    render(
      <Shell
        title={<header>Title bar</header>}
        rail={<nav aria-label="Destinations">rail</nav>}
        label="Plan"
        status={<span>2 checks fail</span>}
      >
        <p>checklist</p>
      </Shell>,
    );

    expect(screen.getByRole('banner')).toBeTruthy();
    expect(screen.getByRole('navigation', { name: 'Destinations' })).toBeTruthy();
    expect(screen.getByRole('main', { name: 'Plan' }).textContent).toBe('checklist');
    expect(screen.getByText('2 checks fail')).toBeTruthy();
  });
});
