import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { defineReflection } from '../../src/index.js';

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
      main?: string;
      types?: string;
      exports?: Record<string, { import?: string; types?: string }>;
    };

    expect(packageJson.main).toBe('./dist/index.js');
    expect(packageJson.types).toBe('./dist/index.d.ts');
    expect(packageJson.exports?.['.']).toEqual({
      import: './dist/index.js',
      types: './dist/index.d.ts'
    });
  });
});
