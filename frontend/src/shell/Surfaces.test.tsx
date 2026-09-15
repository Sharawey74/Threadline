import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ContextRail } from './ContextRail';
import { Card, Pill, Row } from './Surfaces';

describe('the shell surfaces', () => {
  it('names the context rail and makes it inert while collapsed', () => {
    const { rerender } = render(
      <ContextRail label="Material">
        <button type="button">Redis</button>
      </ContextRail>,
    );
    expect(screen.getByRole('complementary', { name: 'Material' })).toBeTruthy();

    rerender(
      <ContextRail label="Material" collapsed>
        <button type="button">Redis</button>
      </ContextRail>,
    );
    // Still mounted, so its scroll position survives, but out of reach.
    expect(screen.queryByRole('complementary', { name: 'Material' })).toBeNull();
    expect(document.querySelector('.sh-context')?.hasAttribute('inert')).toBe(true);
  });

  it('keeps a caller class alongside its own', () => {
    render(
      <>
        <Card className="extra" data-testid="card" />
        <Row className="extra" data-testid="row" />
      </>,
    );
    expect(screen.getByTestId('card').className).toBe('sh-card extra');
    expect(screen.getByTestId('row').className).toBe('sh-row extra');
  });

  it('marks a pill with a topic hue only for topics 1 to 9', () => {
    render(
      <>
        <Pill topic={6}>System Design</Pill>
        <Pill topic={12}>Unknown</Pill>
      </>,
    );
    expect(screen.getByText('System Design').style.borderColor).toBe('var(--t6)');
    expect(screen.getByText('Unknown').style.borderColor).toBe('');
  });
});
