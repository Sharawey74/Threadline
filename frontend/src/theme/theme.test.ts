import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

// The contrast audit, as a test so it cannot quietly stop running.
//
// jsdom resolves no custom properties and does no layout, so this reads the
// stylesheets as text and computes WCAG ratios from the declared hex values.
//
// It reads every stylesheet under src/, not one block of theme.css. A token
// audited in the first :root block and overridden in a later one, in another
// file, under a class or inside @media would pass an audit of the wrong value.

const frontend = resolve(__dirname, '..', '..');
const src = join(frontend, 'src');

function filesUnder(dir: string, match: (name: string) => boolean): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return filesUnder(path, match);
    return match(name) ? [path] : [];
  });
}

interface Block {
  file: string;
  /** Every enclosing prelude, outermost first: "@media (...) > :root". */
  context: string;
  decls: { prop: string; value: string }[];
}

/** Every block in a stylesheet, with its own declarations. Comments removed. */
function blocks(path: string): Block[] {
  const text = readFileSync(path, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const file = relative(src, path).split(sep).join('/');
  const out: Block[] = [];
  const stack: Block[] = [];
  const preludes: string[] = [];
  let buffer = '';

  const flush = () => {
    const m = /^\s*([-\w]+)\s*:\s*([\s\S]+?)\s*$/.exec(buffer);
    if (m && stack.length > 0) stack[stack.length - 1].decls.push({ prop: m[1], value: m[2] });
    buffer = '';
  };

  for (const ch of text) {
    if (ch === '{') {
      preludes.push(buffer.trim().replace(/\s+/g, ' '));
      const block: Block = { file, context: preludes.join(' > '), decls: [] };
      out.push(block);
      stack.push(block);
      buffer = '';
    } else if (ch === '}') {
      flush();
      stack.pop();
      preludes.pop();
    } else if (ch === ';') {
      flush();
    } else {
      buffer += ch;
    }
  }
  return out;
}

const all = filesUnder(src, (name) => name.endsWith('.css')).flatMap(blocks);

const SURFACES = ['--void', '--ground', '--rail', '--card', '--card-hi'];
const LINES = ['--line', '--line-up'];
const TEXT = ['--text', '--text2', '--text3'];
const HUES = ['--t1', '--t2', '--t3', '--t4', '--t5', '--t6', '--t7', '--t8', '--t9'];
const THEMED = [...SURFACES, ...LINES, ...TEXT, '--brand', ...HUES];
const DIMENSIONS = [
  '--window-radius',
  '--titlebar-height',
  '--iconrail-width',
  '--contextrail-width',
];

const DARK = ':root';
const LIGHT = ':root[data-theme="light"]';

/** Where, across every stylesheet, a custom property is declared. */
function declarationsOf(token: string) {
  return all.flatMap((b) =>
    b.decls
      .filter((d) => d.prop === token)
      .map((d) => ({ at: `${b.file} ${b.context}`, value: d.value })),
  );
}

function valueIn(context: string, token: string): string {
  const found = declarationsOf(token).filter((d) => d.at === `workbench/theme.css ${context}`);
  if (found.length !== 1)
    throw new Error(`${token} has ${found.length} declarations in ${context}`);
  return found[0].value;
}

function hex(token: string, value: string): string {
  if (!/^#[0-9a-f]{6}$/i.test(value))
    throw new Error(`${token} is ${value}, not a six-digit hex colour`);
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

describe('where the tokens live', () => {
  // One declaration per theme, in one place. Anything else is a second value
  // the audit below would not be measuring.
  it('declares each themed token exactly once per theme, in theme.css, and nowhere else', () => {
    for (const token of THEMED) {
      expect(
        declarationsOf(token)
          .map((d) => d.at)
          .sort(),
        token,
      ).toEqual([`workbench/theme.css ${DARK}`, `workbench/theme.css ${LIGHT}`].sort());
    }
  });

  it('declares each shell dimension exactly once, in the theme.css :root block', () => {
    for (const token of DIMENSIONS) {
      expect(
        declarationsOf(token).map((d) => d.at),
        token,
      ).toEqual([`workbench/theme.css ${DARK}`]);
    }
  });
});

describe.each([
  ['dark', DARK],
  ['light', LIGHT],
])('the %s theme', (_name, context) => {
  const colour = (token: string) => hex(token, valueIn(context, token));

  it('defines every surface token', () => {
    for (const token of [...SURFACES, ...LINES]) expect(() => colour(token)).not.toThrow();
  });

  it('every text token clears 4.5:1 on all five surfaces', () => {
    for (const text of TEXT) {
      for (const surface of SURFACES) {
        const ratio = contrast(colour(text), colour(surface));
        expect(ratio, `${text} on ${surface} is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('a label on the brand colour clears 4.5:1', () => {
    const ratio = contrast(colour('--void'), colour('--brand'));
    expect(ratio, `--void on --brand is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
  });

  // Non-text marks: WCAG 1.4.11 sets the floor at 3:1.
  it('nine topic hues clear 3:1 against --card', () => {
    for (const hue of HUES) {
      const ratio = contrast(colour(hue), colour('--card'));
      expect(ratio, `${hue} on --card is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('the design values', () => {
  it('text and brand tokens match the measured values', () => {
    expect(valueIn(DARK, '--text2')).toBe('#c9c3e2');
    expect(valueIn(DARK, '--text3')).toBe('#948dba');
    expect(valueIn(DARK, '--brand')).toBe('#7c5cff');
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
    for (const hue of HUES) expect(valueIn(DARK, hue), hue).toBe(drawn[hue]);

    const designFile = resolve(frontend, '..', 'plans', 'UI-Design.html');
    if (existsSync(designFile)) {
      const design = readFileSync(designFile, 'utf8');
      for (const hue of HUES) {
        expect(new RegExp(`${hue}:(#[0-9a-f]{6})`, 'i').exec(design)?.[1], hue).toBe(drawn[hue]);
      }
    }
  });

  it('shell dimensions match the design', () => {
    expect(valueIn(DARK, '--window-radius')).toBe('22px');
    expect(valueIn(DARK, '--titlebar-height')).toBe('44px');
    expect(valueIn(DARK, '--iconrail-width')).toBe('72px');
    expect(valueIn(DARK, '--contextrail-width')).toBe('280px');
  });

  // Exactly one rule, at the top level, with one colour and one background:
  // a second rule, a duplicate declaration or an @media variant would each be
  // a primary button the contrast check above never measured.
  it('brand button label is --void', () => {
    const rules = all.filter((b) =>
      b.context
        .split(' > ')
        .at(-1)!
        .split(',')
        .some((s) => s.trim() === '.btn-primary'),
    );
    expect(rules.map((r) => `${r.file} ${r.context}`)).toEqual([
      'workbench/theme.css .btn-primary',
    ]);

    const [rule] = rules;
    expect(rule.decls.filter((d) => d.prop === 'color')).toEqual([
      { prop: 'color', value: 'var(--void)' },
    ]);
    expect(rule.decls.filter((d) => d.prop === 'background')).toEqual([
      { prop: 'background', value: 'var(--brand)' },
    ]);
  });
});
