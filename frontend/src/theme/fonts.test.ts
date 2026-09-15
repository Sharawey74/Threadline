import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Reads the repo as text. These are guards on what ships, so they look at the
// files themselves rather than at anything a component renders.

const frontend = resolve(__dirname, '..', '..');
const read = (path: string) => readFileSync(join(frontend, path), 'utf8');

function filesUnder(dir: string, match: (name: string) => boolean): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return filesUnder(path, match);
    return match(name) ? [path] : [];
  });
}

describe('fonts', () => {
  it('ships Plus Jakarta Sans and no second UI sans', () => {
    const deps = (JSON.parse(read('package.json')) as { dependencies: Record<string, string> })
      .dependencies;

    expect(deps).toHaveProperty('@fontsource/plus-jakarta-sans');
    expect(deps).not.toHaveProperty('@fontsource/ibm-plex-sans');
  });

  // C6: a remote font does not fail loudly in a Wails window with no network.
  // The face silently never arrives and the fallback renders instead.
  it('no stylesheet references a remote URL', () => {
    const own = filesUnder(join(frontend, 'src'), (name) => name.endsWith('.css'));

    // The @fontsource sheets main.tsx imports are shipped too, so they count.
    const imported = [...read('src/main.tsx').matchAll(/import '(@fontsource\/[^']+\.css)'/g)].map(
      (m) => join(frontend, 'node_modules', m[1]),
    );
    expect(imported.length, 'main.tsx imports no @fontsource stylesheet').toBeGreaterThan(0);

    const remote = /(?:url\(\s*['"]?|@import\s+['"]?)https?:/i;
    for (const file of [...own, ...imported]) {
      expect(existsSync(file), `${file} does not exist`).toBe(true);
      expect(readFileSync(file, 'utf8'), `${file} loads something over the network`).not.toMatch(
        remote,
      );
    }
  });

  // Anchor positioning is native in WebView2, so a positioning library would
  // only be weight (CLAUDE.md, browser support policy).
  it('no positioning library is installed', () => {
    const pkg = JSON.parse(read('package.json')) as Record<
      string,
      Record<string, string> | undefined
    >;
    const declared = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    expect(declared.filter((d) => d.startsWith('@floating-ui/'))).toEqual([]);

    const sources = filesUnder(join(frontend, 'src'), (name) => /\.tsx?$/.test(name));
    for (const file of sources) {
      expect(readFileSync(file, 'utf8'), `${file} imports Floating UI`).not.toMatch(
        /from ['"]@floating-ui\//,
      );
    }
  });
});
