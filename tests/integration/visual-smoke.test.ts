import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createArtifactStore } from '../../src/core/artifact-store.js';
import { startManagedServer, type ManagedServer } from '../../src/core/server-manager.js';
import { runBrowserContract } from '../../src/contracts/browser/browser-contract.js';

const activeServers: ManagedServer[] = [];

async function startBasicReactFixture(): Promise<string> {
  const readyUrl = 'http://127.0.0.1:5173';
  const server = await startManagedServer(
    {
      command: 'corepack pnpm dev --host 127.0.0.1',
      readyUrl,
      reuseExisting: true,
      timeoutMs: 10_000
    },
    {
      cwd: join(process.cwd(), 'examples/basic-react'),
      logPath: join(tmpdir(), `reflection-visual-smoke-${Date.now()}.log`)
    }
  );
  activeServers.push(server);
  return readyUrl;
}

afterEach(async () => {
  while (activeServers.length > 0) {
    const server = activeServers.pop();
    if (server) {
      await server.stop();
    }
  }
});

describe('route visual smoke', () => {
  it('compares the login mobile screenshot against a fixture baseline and links visual artifacts', async () => {
    const baseUrl = await startBasicReactFixture();
    const rootDir = await mkdtemp(join(tmpdir(), 'reflection-visual-smoke-'));
    const store = await createArtifactStore({ rootDir, runId: 'visual-smoke-pass' });

    const checks = await runBrowserContract(
      {
        baseUrl,
        blocking: true,
        routes: [
          {
            id: 'login',
            path: '/login',
            viewports: ['mobile'],
            expects: [
              { role: 'heading', name: 'Login' },
              { label: 'Email' },
              { label: 'Password' },
              { role: 'button', name: 'Sign in' },
              { noHorizontalOverflow: true },
              { noConsoleErrors: true },
              { screenshot: 'final' }
            ]
          }
        ],
        visualSmoke: [
          {
            id: 'login-mobile',
            route: 'login',
            viewport: 'mobile',
            baselineRoot: join(process.cwd(), 'tests/fixtures/baselines'),
            baseline: 'browser/login/mobile.chromium-linux.light.png',
            threshold: { maxDiffPixelRatio: 0.01 }
          }
        ]
      },
      store
    );

    const browserCheck = checks.find((check) => check.id === 'browser.login.mobile');
    const visualCheck = checks.find((check) => check.id === 'visual.login-mobile');

    expect(browserCheck?.status).toBe('pass');
    expect(visualCheck).toMatchObject({
      suite: 'visual',
      target: '/login mobile',
      status: 'pass',
      severity: 'review',
      metadata: {
        classification: 'visual-match',
        routeId: 'login',
        viewport: 'mobile',
        baselinePath: expect.stringContaining('mobile.chromium-linux.light.png')
      }
    });

    expect(visualCheck?.artifacts.map((artifact) => [artifact.role, artifact.path])).toEqual([
      ['expected', 'visual/login-mobile/expected.png'],
      ['actual', 'visual/login-mobile/actual.png'],
      ['diff', 'visual/login-mobile/diff.png']
    ]);

    for (const artifact of visualCheck?.artifacts ?? []) {
      await expect(readFile(store.resolveRunPath(artifact.path))).resolves.toBeInstanceOf(Buffer);
    }
  }, 20_000);

  it('reports a missing baseline as review-only by default', async () => {
    const baseUrl = await startBasicReactFixture();
    const rootDir = await mkdtemp(join(tmpdir(), 'reflection-visual-smoke-missing-'));
    const store = await createArtifactStore({ rootDir, runId: 'visual-smoke-missing' });

    const checks = await runBrowserContract(
      {
        baseUrl,
        blocking: true,
        routes: [
          {
            id: 'login',
            path: '/login',
            viewports: ['mobile'],
            expects: [{ role: 'heading', name: 'Login' }, { screenshot: 'final' }]
          }
        ],
        visualSmoke: [
          {
            id: 'login-mobile-missing',
            route: 'login',
            viewport: 'mobile',
            baselineRoot: rootDir,
            baseline: 'missing-baseline.png',
            threshold: { maxDiffPixelRatio: 0.01 }
          }
        ]
      },
      store
    );

    expect(checks.find((check) => check.id === 'visual.login-mobile-missing')).toMatchObject({
      status: 'warn',
      severity: 'review',
      metadata: {
        classification: 'missing-baseline'
      }
    });
  }, 20_000);
});
