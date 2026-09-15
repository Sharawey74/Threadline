import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// The contrast audit, as a test so it cannot quietly stop running.
//
// jsdom resolves no custom properties and does no layout, so this reads
// theme.css as text and computes WCAG ratios from the declared hex values.

const frontend = resolve(__dirname, '..', '..');
const css = readFileSync(join(frontend, 'src', 'workbench', 'theme.css'), 'utf8');

/** The declarations inside the first block whose selector is exactly `selector`. */
function block(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`no ${selector} block in theme.css`);
  const body = css.slice(start + selector.length + 2, css.indexOf('\n}', start));
  const out: Record<string, string> = {};
  for (const m of body.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    out[m[1]] = m[2].trim();
  }
  return out;
}

const dark = block(':root');
const lightOwn = block(':root[data-theme="light"]');
// Light only overrides; anything it does not set inherits from :root.
const themes = { dark, light: { ...dark, ...lightOwn } };
const declared = { dark, light: lightOwn };

const SURFACES = ['--void', '--ground', '--rail', '--card', '--card-hi'];
const LINES = ['--line', '--line-up'];
const TEXT = ['--text', '--text2', '--text3'];
const HUES = ['--t1', '--t2', '--t3', '--t4', '--t5', '--t6', '--t7', '--t8', '--t9'];

function hex(theme: Record<string, string>, token: string): string {
  const value = theme[token];
  if (!/^#[0-9a-f]{6}$/i.test(value ?? '')) {
    throw new Error(`${token} is ${value ?? 'undefined'}, not a six-digit hex colour`);
  }
  return value;
}

function luminance(colour: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(colour.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe.each(Object.entries(themes))('the %s theme', (name, theme) => {
  // Checked against the block's own declarations: a light token that silently
  // inherited its dark value would pass every ratio below on the wrong colour.
  it('defines every surface token', () => {
    const own = declared[name as keyof typeof declared];
    for (const token of [...SURFACES, ...LINES]) expect(() => hex(own, token)).not.toThrow();
  });

  it('every text token clears 4.5:1 on all five surfaces', () => {
    for (const text of TEXT) {
      for (const surface of SURFACES) {
        const ratio = contrast(hex(theme, text), hex(theme, surface));
        expect(ratio, `${text} on ${surface} is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('a label on the brand colour clears 4.5:1', () => {
    const ratio = contrast(hex(theme, '--void'), hex(theme, '--brand'));
    expect(ratio, `--void on --brand is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
  });

  // Non-text marks: WCAG 1.4.11 sets the floor at 3:1.
  it('nine topic hues clear 3:1 against --card', () => {
    for (const hue of HUES) {
      const ratio = contrast(hex(theme, hue), hex(theme, '--card'));
      expect(ratio, `${hue} on --card is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('the design values', () => {
  it('text and brand tokens match the measured values', () => {
    expect(dark['--text2']).toBe('#c9c3e2');
    expect(dark['--text3']).toBe('#948dba');
    expect(dark['--brand']).toBe('#7c5cff');
  });

  // The drawn values are pinned here because plans/ is gitignored and CI never
  // sees it. Where the design file exists, the pin is checked against it.
  it('dark topic hues are the ones drawn in UI-Design.html', () => {
    const drawn: Record<string, string> = {
      '--t1': '#f59e0b',
      '--t2': '#22d3ee',
      '--t3': '#a78bfa',
      '--t4': '#fb7185',
      '--t5': '#34d399',
      '--t6': '#f97316',
      '--t7': '#60a5fa',
      '--t8': '#2dd4bf',
      '--t9': '#e879f9',
    };
    for (const hue of HUES) expect(dark[hue], hue).toBe(drawn[hue]);

    const designFile = resolve(frontend, '..', 'plans', 'UI-Design.html');
    if (existsSync(designFile)) {
      const design = readFileSync(designFile, 'utf8');
      for (const hue of HUES) {
        expect(new RegExp(`${hue}:(#[0-9a-f]{6})`, 'i').exec(design)?.[1], hue).toBe(drawn[hue]);
      }
    }
  });

  it('shell dimensions match the design', () => {
    expect(dark['--window-radius']).toBe('22px');
    expect(dark['--titlebar-height']).toBe('44px');
    expect(dark['--iconrail-width']).toBe('72px');
    expect(dark['--contextrail-width']).toBe('280px');
  });

  it('brand button label is --void', () => {
    const rule = /\.btn-primary\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(rule, 'no .btn-primary rule in theme.css').not.toBe('');
    expect(rule).toMatch(/(?:^|;|\s)color:\s*var\(--void\)/);
    expect(rule).toMatch(/background:\s*var\(--brand\)/);
  });
});
