import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { defineReflection, type ReflectionPortalMountInput } from '../../src/index.js';

describe('public package surface', () => {
  it('exports defineReflection for documented config files', () => {
    const config = defineReflection({
      project: 'documented-app',
      contracts: {
        browser: {
          baseUrl: 'http://127.0.0.1:5173',
          routes: []
        }
      }
    });

    expect(config.project).toBe('documented-app');
  });

  it('declares package entrypoints for the documented root import', async () => {
    const packageJson = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8')) as {
      bin?: Record<string, string>;
      dependencies?: Record<string, string>;
      files?: string[];
      license?: string;
      main?: string;
      name?: string;
      private?: boolean;
      publishConfig?: { access?: string };
      types?: string;
      version?: string;
      exports?: Record<string, { import?: string; types?: string }>;
    };

    expect(packageJson.name).toBe('reflection-check');
    expect(packageJson.version).toBe('0.0.5');
    expect(packageJson.private).toBeUndefined();
    expect(packageJson.license).toBe('MIT');
    expect(packageJson.publishConfig?.access).toBe('public');
    expect(packageJson.main).toBe('./dist/index.js');
    expect(packageJson.types).toBe('./dist/index.d.ts');
    expect(packageJson.bin?.reflection).toBe('dist/cli.js');
    expect(packageJson.bin?.['reflection-check']).toBe('dist/cli.js');
    expect(packageJson.files).toEqual(expect.arrayContaining(['dist', 'docs', 'LICENSE', 'README.md']));
    expect(packageJson.dependencies?.playwright).toBeDefined();
    expect(packageJson.dependencies?.vite).toBeDefined();
    expect(packageJson.exports?.['.']).toEqual({
      import: './dist/index.js',
      types: './dist/index.d.ts'
    });
  });

  it('exports portal entry types for generated component portals', () => {
    const input = {
      id: 'button-primary',
      path: '/reflection/button/primary/light',
      root: {} as HTMLElement,
      viewport: 'button-default',
      viewportSize: { width: 390, height: 220 },
      framing: { align: 'center', padding: 0 }
    } satisfies ReflectionPortalMountInput;

    expect(input.path).toBe('/reflection/button/primary/light');
  });
});
