import { copyFile, mkdir, mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { PNG } from 'pngjs';
import { afterEach, describe, expect, it } from 'vitest';
import { createArtifactStore } from '../../src/core/artifact-store.js';
import { startManagedServer, type ManagedServer } from '../../src/core/server-manager.js';
import { runBrowserContract } from '../../src/contracts/browser/browser-contract.js';

const activeServers: ManagedServer[] = [];

async function startBasicReactFixture(): Promise<string> {
  const readyUrl = 'http://127.0.0.1:5174';
  const server = await startManagedServer(
    {
      command: 'pnpm dev --host 127.0.0.1 --port 5174',
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

    const result = await runBrowserContract(
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
    const checks = result.checks;

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

    const result = await runBrowserContract(
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
    const checks = result.checks;

    expect(checks.find((check) => check.id === 'visual.login-mobile-missing')).toMatchObject({
      status: 'warn',
      severity: 'review',
      metadata: {
        classification: 'missing-baseline'
      }
    });

    const missingBaselineCheck = checks.find((check) => check.id === 'visual.login-mobile-missing');
    expect(missingBaselineCheck?.artifacts.map((artifact) => [artifact.role, artifact.path])).toEqual([['actual', 'visual/login-mobile-missing/actual.png']]);
    await expect(readFile(store.resolveRunPath('visual/login-mobile-missing/actual.png'))).resolves.toBeInstanceOf(Buffer);
  }, 20_000);

  it('captures a selector-scoped route visual for long print-like documents', async () => {
    const baseUrl = await startBasicReactFixture();
    const rootDir = await mkdtemp(join(tmpdir(), 'reflection-visual-smoke-selector-'));
    const store = await createArtifactStore({ rootDir, runId: 'visual-smoke-selector' });

    const result = await runBrowserContract(
      {
        baseUrl,
        blocking: true,
        routes: [
          {
            id: 'print-fixture',
            path: '/print-fixture',
            viewports: ['desktop'],
            expects: [
              { selectorCount: { selector: '.page', equals: 7 } },
              { noSelector: '.signature-line' },
              { text: 'Electronic signatures' },
              { screenshot: 'final' }
            ]
          }
        ],
        visualSmoke: [
          {
            id: 'print-page-7',
            route: 'print-fixture',
            viewport: 'desktop',
            capture: { selector: '.page[data-page="7"]' },
            baselineRoot: rootDir,
            baseline: 'browser/print/page-7.png',
            scenario: 'annual-report-full-smoke'
          }
        ]
      },
      store
    );

    const visualCheck = result.checks.find((check) => check.id === 'visual.print-page-7');

    expect(result.checks.find((check) => check.id === 'browser.print-fixture.desktop')?.status).toBe('pass');
    expect(visualCheck).toMatchObject({
      status: 'warn',
      severity: 'review',
      metadata: {
        classification: 'missing-baseline',
        capture: { selector: '.page[data-page="7"]' },
        scenario: 'annual-report-full-smoke'
      }
    });
    expect(visualCheck?.artifacts.map((artifact) => [artifact.role, artifact.path])).toEqual([['actual', 'visual/print-page-7/actual.png']]);
    await expect(readFile(store.resolveRunPath('visual/print-page-7/actual.png'))).resolves.toBeInstanceOf(Buffer);
  }, 20_000);

  it('renders a custom-sized route at exactly that size and diffs it against a same-size baseline', async () => {
    const baseUrl = await startBasicReactFixture();
    const rootDir = await mkdtemp(join(tmpdir(), 'reflection-visual-smoke-custom-viewport-'));
    const designViewport = { name: 'design-1512', width: 1512, height: 982 };
    const routes = [
      { id: 'login', path: '/login', viewports: [designViewport], expects: [{ role: 'heading' as const, name: 'Login' }, { screenshot: 'final' }] }
    ];

    const firstStore = await createArtifactStore({ rootDir, runId: 'custom-viewport-seed' });
    await runBrowserContract({ baseUrl, blocking: true, routes }, firstStore);
    const actualPath = firstStore.resolveRunPath('browser/login/design-1512/actual.png');
    const seededPng = PNG.sync.read(await readFile(actualPath));
    expect([seededPng.width, seededPng.height]).toEqual([1512, 982]);

    const baselineRoot = join(rootDir, 'references');
    await mkdir(dirname(join(baselineRoot, 'login-page/design.png')), { recursive: true });
    await copyFile(actualPath, join(baselineRoot, 'login-page/design.png'));

    const store = await createArtifactStore({ rootDir, runId: 'custom-viewport-compare' });
    const result = await runBrowserContract(
      {
        baseUrl,
        blocking: true,
        routes,
        visualSmoke: [
          { id: 'login-design', route: 'login', viewport: 'design-1512', baselineRoot, baseline: 'login-page/design.png', strict: false }
        ]
      },
      store
    );

    expect(result.checks.find((check) => check.id === 'browser.login.design-1512')?.status).toBe('pass');
    expect(result.checks.find((check) => check.id === 'visual.login-design')).toMatchObject({
      status: 'pass',
      metadata: { classification: 'visual-match', viewport: 'design-1512', width: 1512, height: 982 }
    });
  }, 30_000);

  it('names both sizes when a preset-sized screenshot cannot match a design baseline', async () => {
    const baseUrl = await startBasicReactFixture();
    const rootDir = await mkdtemp(join(tmpdir(), 'reflection-visual-smoke-mismatch-'));
    const seedStore = await createArtifactStore({ rootDir, runId: 'mismatch-seed' });
    const designRoutes = [
      { id: 'login', path: '/login', viewports: [{ name: 'design-1512', width: 1512, height: 982 }], expects: [{ screenshot: 'final' }] }
    ];
    await runBrowserContract({ baseUrl, blocking: true, routes: designRoutes }, seedStore);
    const baselineRoot = join(rootDir, 'references');
    await mkdir(baselineRoot, { recursive: true });
    await copyFile(seedStore.resolveRunPath('browser/login/design-1512/actual.png'), join(baselineRoot, 'design.png'));

    const store = await createArtifactStore({ rootDir, runId: 'mismatch-compare' });
    const result = await runBrowserContract(
      {
        baseUrl,
        blocking: true,
        routes: [{ id: 'login', path: '/login', viewports: ['desktop'], expects: [{ screenshot: 'final' }] }],
        visualSmoke: [{ id: 'login-desktop', route: 'login', viewport: 'desktop', baselineRoot, baseline: 'design.png' }]
      },
      store
    );

    expect(result.checks.find((check) => check.id === 'visual.login-desktop')?.summary).toMatch(/expected 1512x982, actual 1440x\d+/);
  }, 30_000);
});
