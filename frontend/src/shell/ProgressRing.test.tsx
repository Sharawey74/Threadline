import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ProgressRing } from './ProgressRing';

/**
 * Attributes that carry geometry or the range itself. Everything else an
 * element carries - title, aria-description, alt, data-*, text - is something a
 * person can read or hear, so a number in it is a number shown (C5).
 */
const GEOMETRY = new Set([
  'class',
  'style',
  'role',
  'width',
  'height',
  'viewBox',
  'xmlns',
  'fill',
  'cx',
  'cy',
  'r',
  'transform',
  'aria-hidden',
  'stroke',
  'stroke-width',
  'stroke-dasharray',
  'stroke-dashoffset',
  'stroke-linecap',
  'aria-valuemin',
  'aria-valuenow',
  'aria-valuemax',
]);

describe('the progress ring', () => {
  it('reports exactly the value and max it was given', () => {
    const { container } = render(<ProgressRing value={4} max={9} label="sections" />);

    const ring = screen.getByRole('progressbar', { name: 'sections' });
    expect(ring.getAttribute('aria-valuenow')).toBe('4');
    expect(ring.getAttribute('aria-valuemax')).toBe('9');

    const readable = [container.textContent ?? ''];
    for (const el of container.querySelectorAll('*')) {
      for (const attr of el.attributes) {
        if (!GEOMETRY.has(attr.name)) readable.push(attr.value);
      }
    }
    const numbers = readable.join(' ').match(/\d+/g) ?? [];
    expect(numbers).toEqual(expect.arrayContaining(['4', '9']));
    expect(numbers.filter((n) => n !== '4' && n !== '9')).toEqual([]);
  });

  it('draws nothing when the total is not known', () => {
    const { container } = render(<ProgressRing value={4} label="sections" />);
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(container.innerHTML).toBe('');
  });
});
