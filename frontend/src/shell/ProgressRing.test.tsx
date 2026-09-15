import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ProgressRing } from './ProgressRing';

describe('the progress ring', () => {
  it('reports exactly the value and max it was given', () => {
    const { container } = render(<ProgressRing value={4} max={9} label="sections" />);

    const ring = screen.getByRole('progressbar', { name: 'sections' });
    expect(ring.getAttribute('aria-valuenow')).toBe('4');
    expect(ring.getAttribute('aria-valuemax')).toBe('9');

    // C5: every number on screen was given to it. No percentage, no estimate.
    // Accessible text counts too - a screen reader reads it as a number shown.
    const shown = [
      container.textContent ?? '',
      ...[...container.querySelectorAll('[aria-label], [aria-valuetext]')].flatMap((el) => [
        el.getAttribute('aria-label') ?? '',
        el.getAttribute('aria-valuetext') ?? '',
      ]),
    ].join(' ');
    expect(shown.match(/\d+/g)).toEqual(expect.arrayContaining(['4', '9']));
    expect((shown.match(/\d+/g) ?? []).filter((n) => n !== '4' && n !== '9')).toEqual([]);
  });

  it('draws nothing when the total is not known', () => {
    const { container } = render(<ProgressRing value={4} label="sections" />);
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(container.textContent).toBe('');
  });
});
