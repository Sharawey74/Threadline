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

/** Installed and built output: not source anyone writes. */
const SKIP = new Set(['node_modules', 'dist']);

function filesUnder(dir: string, match: (name: string) => boolean): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return SKIP.has(name) ? [] : filesUnder(path, match);
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

// Every stylesheet in the frontend, not only src/: one imported from outside
// src/ ships just the same.
const stylesheets = filesUnder(frontend, (name) => name.endsWith('.css'));
const all = stylesheets.flatMap(blocks);

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

const AUDITED = [...THEMED, ...DIMENSIONS];

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

/** The only places a token may be declared: its theme.css block(s). */
function homesOf(token: string): string[] {
  const themes = DIMENSIONS.includes(token) ? [DARK] : [DARK, LIGHT];
  return themes.map((theme) => `workbench/theme.css ${theme}`);
}

/** Declarations of a token anywhere but its own theme.css block(s), or twice there. */
function misplacedDeclarations(token: string): string[] {
  const found = declarationsOf(token).map((d) => d.at);
  const homes = homesOf(token);
  const counted = homes.map((home) => found.filter((at) => at === home).length);
  return [
    ...found.filter((at) => !homes.includes(at)).map((at) => `${token} declared in ${at}`),
    ...homes.filter((_, i) => counted[i] > 1).map((home) => `${token} declared twice in ${home}`),
  ];
}

// A CSS audit cannot see a value set elsewhere: an inline style in a
// component, a <style> in index.html. Outside theme.css an audited token may
// only be read, through var(); anything else is a second, unaudited value.
const scanned = [
  ...filesUnder(src, (name) => !/\.test\.[jt]sx?$/.test(name)),
  join(frontend, 'index.html'),
  ...stylesheets.filter((path) => !path.startsWith(src)),
]
  .filter((path) => relative(src, path).split(sep).join('/') !== 'workbench/theme.css')
  .map((path) => ({
    name: relative(frontend, path).split(sep).join('/'),
    text: readFileSync(path, 'utf8'),
  }));

/** Places outside theme.css that name a token other than to read it through var(). */
function unguardedMentions(token: string): string[] {
  const name = new RegExp(`(?<![A-Za-z0-9_-])${token}(?![A-Za-z0-9_-])`, 'g');
  return scanned.flatMap(({ name: file, text }) =>
    [...text.matchAll(name)]
      .filter((m) => !/var\(\s*$/.test(text.slice(0, m.index)))
      .map(() => `${file}: ${token} outside var()`),
  );
}

/**
 * The one value a token has in a theme. Throws if the token is set anywhere
 * else, so every test that reads a value also proves it is the only value.
 */
function valueIn(context: string, token: string): string {
  const elsewhere = [...misplacedDeclarations(token), ...unguardedMentions(token)];
  if (elsewhere.length > 0)
    throw new Error(`${token} is not only set in theme.css: ${elsewhere.join('; ')}`);
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
  // the audit below would not be measuring. valueIn() applies the same check
  // to every token it reads.
  it('declares each themed token exactly once per theme, in theme.css, and nowhere else', () => {
    for (const token of THEMED) {
      expect(misplacedDeclarations(token), token).toEqual([]);
      expect(
        declarationsOf(token)
          .map((d) => d.at)
          .sort(),
        token,
      ).toEqual(homesOf(token).sort());
    }
  });

  it('declares each shell dimension exactly once, in the theme.css :root block', () => {
    for (const token of DIMENSIONS) {
      expect(
        declarationsOf(token).map((d) => d.at),
        token,
      ).toEqual(homesOf(token));
    }
  });
});

describe('where the tokens can be set', () => {
  it('names an audited token outside theme.css only inside var()', () => {
    expect(AUDITED.flatMap(unguardedMentions)).toEqual([]);
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
    // Any rule that mentions the class at all - descendant, compound, :hover,
    // :where(), a theme-scoped variant - can restyle the button.
    const rules = all.filter((b) => b.context.includes('btn-primary'));
    expect(rules.map((r) => `${r.file} ${r.context}`)).toEqual([
      'workbench/theme.css .btn-primary',
    ]);

    // And within it, anything that can change the label or the fill.
    const paint = rules[0].decls.filter(
      (d) => d.prop === 'color' || d.prop === 'all' || d.prop.startsWith('background'),
    );
    expect(paint).toEqual([
      { prop: 'color', value: 'var(--void)' },
      { prop: 'background', value: 'var(--brand)' },
    ]);
  });
});
