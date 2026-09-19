import { render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { foldSource, readable, settled, sourceHits } from './index';

describe('the absence-test helpers', () => {
  it('readable() hears every name, per element, with no-break spaces as spaces', () => {
    render(
      <div>
        <span>CURRENT{'\u00a0'}BOOKMARK</span>
        <span id="lbl">Edge PDF Sync</span>
        <button type="button" aria-labelledby="lbl" />
        <input aria-label="Retention rate" defaultValue="v7.2" />
        <p>pages</p>
        <p>Outline</p>
      </div>,
    );
    const text = readable();
    expect(text).toContain('CURRENT BOOKMARK');
    expect(text.filter((t) => t === 'Edge PDF Sync').length).toBeGreaterThanOrEqual(2);
    expect(text).toContain('Retention rate');
    expect(text).toContain('v7.2');
    // Per element, so a word boundary after "pages" survives.
    expect(text.some((t) => /\bpages\b/.test(t))).toBe(true);
  });

  it('foldSource() reads source as it renders', () => {
    const tsx = [
      '// Edge PDF Sync in a comment',
      '/* REVISION CADENCE in a block comment */',
      "const url = 'file:///x';",
      '<p>',
      '  Edge PDF',
      '  Sync',
      '</p>',
      "<span>Outline{' '}verified</span>",
      '<span>Outline{" "}checked</span>',
      '<b>CURRENT&nbsp;BOOKMARK</b>',
    ].join('\n');
    const folded = foldSource(tsx);
    expect(folded).not.toContain('revision cadence');
    expect(folded).toContain('file:///x');
    expect(folded).toContain('edge pdf sync');
    expect(folded).toContain('outline verified');
    expect(folded).toContain('outline checked');
    expect(folded).toContain('current bookmark');
    // Only the comment line was dropped; the wrapped text is still there once.
    expect(folded.match(/edge pdf sync/g)).toHaveLength(1);
  });

  it('sourceHits() names the file and the needle', () => {
    const hits = sourceHits({ './a.ts': "export const X = 'Edge PDF Sync';", './b.tsx': 'fine' }, [
      'edge pdf sync',
      /type="radio/,
    ]);
    expect(hits).toEqual(['edge pdf sync in ./a.ts']);
  });

  it('settled() waits for calls set off by calls', async () => {
    const second = vi.fn(
      () =>
        new Promise<string>((r) =>
          setTimeout(() => {
            r('b');
          }, 30),
        ),
    );
    const first = vi.fn(
      () =>
        new Promise<void>((r) =>
          setTimeout(() => {
            void second();
            r();
          }, 30),
        ),
    );

    function Late() {
      const [text, setText] = useState('');
      return (
        <button
          type="button"
          onClick={() => {
            void first().then(async () => {
              setText((await second.mock.results[0].value) as string);
            });
          }}
        >
          go {text}
        </button>
      );
    }

    render(<Late />);
    screen.getByRole('button').click();
    await settled(first, second);
    expect(screen.getByRole('button').textContent).toBe('go b');
  });
});
