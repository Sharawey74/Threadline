import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Guards on what ships. Each one checks the property itself - "this name is
// nowhere", "no shipped sheet loads over the network" - rather than one way of
// writing it, because every narrower check had a spelling that slipped past.

const frontend = resolve(__dirname, '..', '..');
const read = (path: string) => readFileSync(join(frontend, path), 'utf8');

function filesUnder(dir: string, match: (name: string) => boolean = () => true): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return filesUnder(path, match);
    return match(name) ? [path] : [];
  });
}

type Manifest = Record<string, unknown> & Partial<Record<DepField, Record<string, string>>>;
type DepField = 'dependencies' | 'devDependencies' | 'optionalDependencies' | 'peerDependencies';
const FIELDS: DepField[] = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
];

const manifest = JSON.parse(read('package.json')) as Manifest;
const declared = FIELDS.flatMap((f) => Object.keys(manifest[f] ?? {}));

/** Files whose text is searched for a banned name: the manifests and all of src/. */
const searched = [
  join(frontend, 'package.json'),
  join(frontend, 'package-lock.json'),
  ...filesUnder(join(frontend, 'src')),
];

/** The file, if any, that mentions `needle`. This test file names what it bans. */
function mentions(needle: string): string[] {
  return searched.filter(
    (file) => !file.endsWith('fonts.test.ts') && readFileSync(file, 'utf8').includes(needle),
  );
}

describe('fonts', () => {
  it('ships Plus Jakarta Sans and no second UI sans', () => {
    expect(manifest.dependencies).toHaveProperty('@fontsource/plus-jakarta-sans');
    // Any dependency field, the lockfile, or an import: not one of them may
    // still carry the face it replaced.
    expect(mentions('@fontsource/ibm-plex-sans')).toEqual([]);
  });

  // C6: a remote font does not fail loudly in a Wails window with no network.
  // The face silently never arrives and the fallback renders instead.
  it('no stylesheet references a remote URL', () => {
    const fontsource = declared.filter((name) => name.startsWith('@fontsource/'));
    expect(fontsource.length, 'no @fontsource package is declared').toBeGreaterThan(0);

    // Every sheet each declared font package ships, not only the ones main.tsx
    // happens to name - a bare or differently quoted import reaches the rest.
    const sheets = [
      ...filesUnder(join(frontend, 'src'), (name) => name.endsWith('.css')),
      ...fontsource.flatMap((name) => {
        const dir = join(frontend, 'node_modules', name);
        expect(existsSync(dir), `${name} is declared but not installed`).toBe(true);
        return filesUnder(dir, (file) => file.endsWith('.css'));
      }),
    ];

    const remote = /(?:url\(\s*['"]?|@import\s+(?:url\(\s*)?['"]?)\s*(?:https?:)?\/\//i;
    for (const sheet of sheets) {
      expect(readFileSync(sheet, 'utf8'), `${sheet} loads something over the network`).not.toMatch(
        remote,
      );
    }

    // And nothing imports a font package that is not declared, in any quote style.
    const imported = filesUnder(
      join(frontend, 'src'),
      (name) => /\.[jt]sx?$/.test(name) && name !== 'fonts.test.ts',
    ).flatMap((file) =>
      [...readFileSync(file, 'utf8').matchAll(/['"`](@fontsource\/[^/'"`]+)/g)].map((m) => m[1]),
    );
    expect(imported.filter((name) => !fontsource.includes(name))).toEqual([]);
  });

  // Anchor positioning is native in WebView2, so a positioning library would
  // only be weight (CLAUDE.md, browser support policy).
  it('no positioning library is installed', () => {
    expect(
      existsSync(join(frontend, 'node_modules', '@floating-ui')),
      'node_modules/@floating-ui exists',
    ).toBe(false);
    expect(mentions('@floating-ui/')).toEqual([]);
  });
});
