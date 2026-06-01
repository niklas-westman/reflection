import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadRouteManifestTargets, parseRouteManifestTargets } from '../../src/adapters/route-manifest.js';

async function makeTempDir() {
  const dir = join(tmpdir(), `reflection-route-manifest-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  await mkdir(dir, { recursive: true });
  return dir;
}

describe('route manifest adapter', () => {
  it('converts a JSON route manifest into adapter-sourced browser route target IR', async () => {
    const dir = await makeTempDir();
    const manifestPath = join(dir, 'routes.json');
    await writeFile(
      manifestPath,
      JSON.stringify({
        project: 'fixture-app',
        baseUrl: 'http://127.0.0.1:5173',
        maskSelectors: ['[data-private]'],
        routes: [
          {
            id: 'login',
            name: 'Login',
            path: '/login',
            viewports: ['desktop', 'mobile'],
            expects: [{ role: 'heading', name: 'Welcome' }],
            blocking: false
          }
        ]
      }),
      'utf8'
    );

    const ir = await loadRouteManifestTargets(manifestPath);

    expect(ir).toMatchObject({
      project: 'fixture-app',
      targets: [
        {
          family: 'browser-route',
          source: 'adapter',
          id: 'login',
          runModes: ['smoke', 'full'],
          blocking: false,
          route: {
            path: '/login',
            name: 'Login',
            viewports: ['desktop', 'mobile'],
            expects: [{ role: 'heading', name: 'Welcome' }]
          },
          browser: {
            baseUrl: 'http://127.0.0.1:5173',
            maskSelectors: ['[data-private]']
          }
        }
      ]
    });
  });

  it('is optional and fails malformed manifest input before runner execution', () => {
    expect(() =>
      parseRouteManifestTargets({
        project: 'fixture-app',
        baseUrl: 'not-a-url',
        routes: [{ id: 'login', path: '/login' }]
      })
    ).toThrow(/Invalid route manifest/);
  });

  it('rejects ambiguous expectation objects before they reach route runners', () => {
    expect(() =>
      parseRouteManifestTargets({
        project: 'fixture-app',
        baseUrl: 'http://127.0.0.1:5173',
        routes: [
          {
            id: 'login',
            path: '/login',
            expects: [{ role: 'heading', text: 'Welcome' }]
          }
        ]
      })
    ).toThrow(/Invalid route manifest/);
  });

  it('rejects duplicate route ids before they can collide as targets', () => {
    expect(() =>
      parseRouteManifestTargets({
        project: 'fixture-app',
        baseUrl: 'http://127.0.0.1:5173',
        routes: [
          { id: 'login', path: '/login' },
          { id: 'login', path: '/sign-in' }
        ]
      })
    ).toThrow(/duplicate route id/);
  });

  it('keeps adapter output generic and free of external product names', () => {
    const ir = parseRouteManifestTargets({
      project: 'fixture-app',
      baseUrl: 'http://127.0.0.1:5173',
      routes: [{ id: 'home', path: '/', viewports: ['desktop'], expects: [] }]
    });

    const text = JSON.stringify(ir).toLowerCase();
    expect(text).toContain('adapter');
    expect(text).not.toContain('greenhouse');
  });
});
