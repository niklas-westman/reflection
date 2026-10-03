import { copyFile, mkdir, mkdtemp, readFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createArtifactStore } from '../../src/core/artifact-store.js';
import { startManagedServer, type ManagedServer } from '../../src/core/server-manager.js';
import { runBrowserContract, type BrowserContractConfig } from '../../src/contracts/browser/browser-contract.js';

let server: ManagedServer | undefined;
let baseUrl = '';
const configDir = join(process.cwd(), 'tests/fixtures/network');
const candidatesStub = { method: 'GET', url: '**/api/candidates', status: 200, file: 'candidates.json' };
const designViewport = { name: 'design-1512', width: 1512, height: 982 };

async function getFreePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      probe.close(() => (typeof address === 'object' && address ? resolvePort(address.port) : reject(new Error('no port'))));
    });
  });
}

async function run(runId: string, config: Partial<BrowserContractConfig> & Pick<BrowserContractConfig, 'routes'>) {
  const store = await createArtifactStore({ rootDir: await mkdtemp(join(tmpdir(), 'reflection-states-')), runId });
  const result = await runBrowserContract({ baseUrl, blocking: true, configDir, ...config }, store);
  return { store, ...result };
}

beforeAll(async () => {
  const port = await getFreePort();
  baseUrl = `http://127.0.0.1:${port}`;
  server = await startManagedServer(
    { command: `pnpm dev --host 127.0.0.1 --port ${port}`, readyUrl: baseUrl, reuseExisting: false, timeoutMs: 15_000 },
    { cwd: join(process.cwd(), 'examples/basic-react'), logPath: join(tmpdir(), `reflection-states-${Date.now()}.log`) }
  );
});

afterAll(async () => {
  await server?.stop();
});

describe('route states', () => {
  it('runs each state from a fresh navigation and writes per-state artifacts', async () => {
    const result = await run('states', {
      setup: { network: { stubs: [candidatesStub], unmatched: 'fail' } },
      routes: [
        {
          id: 'workspace',
          path: '/workspace',
          viewports: [designViewport],
          expects: [],
          states: [
            { id: 'start', expects: [{ role: 'heading', name: 'Workspace' }, { screenshot: 'final' }] },
            {
              id: 'overview',
              steps: [{ click: { role: 'button', name: 'Luna Larsson' } }],
              expects: [{ role: 'heading', name: 'Luna Larsson' }, { screenshot: 'final' }]
            },
            {
              id: 'chat',
              steps: [{ click: { role: 'button', name: 'Luna Larsson' } }, { click: { role: 'button', name: 'Chat' } }, { waitFor: { label: 'Message' } }],
              expects: [{ label: 'Message' }, { screenshot: 'final' }]
            }
          ]
        }
      ]
    });

    expect(result.checks.map((check) => [check.id, check.status])).toEqual([
      ['browser.workspace.design-1512.start', 'pass'],
      ['browser.workspace.design-1512.overview', 'pass'],
      ['browser.workspace.design-1512.chat', 'pass']
    ]);
    expect(result.checks.map((check) => check.metadata.state)).toEqual(['start', 'overview', 'chat']);
    for (const state of ['start', 'overview', 'chat']) {
      await expect(readFile(result.store.resolveRunPath(`browser/workspace/design-1512/${state}/actual.png`))).resolves.toBeInstanceOf(Buffer);
    }
  }, 40_000);

  it('fails only the state whose step cannot run and keeps a failure screenshot', async () => {
    const result = await run('step-failure', {
      setup: { network: { stubs: [candidatesStub] } },
      routes: [
        {
          id: 'workspace',
          path: '/workspace',
          viewports: ['desktop'],
          expects: [],
          states: [
            { id: 'broken', steps: [{ click: { role: 'button', name: 'Nobody Here' } }], expects: [{ screenshot: 'final' }] },
            { id: 'start', expects: [{ role: 'heading', name: 'Workspace' }] }
          ]
        }
      ]
    });

    const broken = result.checks.find((check) => check.id === 'browser.workspace.desktop.broken');
    expect(broken).toMatchObject({ status: 'fail', metadata: { classification: 'step-failure' } });
    expect(broken?.summary).toContain('step 1 (click role="button" name="Nobody Here")');
    expect(broken?.artifacts.map((artifact) => artifact.path)).toContain('browser/workspace/desktop/broken/failure.png');
    expect(result.checks.find((check) => check.id === 'browser.workspace.desktop.start')?.status).toBe('pass');
  }, 40_000);
});

describe('visual smoke by state', () => {
  it('compares each state screenshot against its own baseline', async () => {
    const routes = [
      {
        id: 'workspace',
        path: '/workspace',
        viewports: [designViewport],
        expects: [],
        states: [
          { id: 'start', expects: [{ screenshot: 'final' }] },
          { id: 'overview', steps: [{ click: { role: 'button' as const, name: 'Luna Larsson' } }], expects: [{ screenshot: 'final' }] }
        ]
      }
    ];
    const setup = { clock: { now: '2026-10-03T09:00:00+02:00' }, network: { stubs: [candidatesStub], unmatched: 'fail' as const } };
    const seed = await run('visual-state-seed', { setup, routes });
    const baselineRoot = join(seed.store.runDir, 'references');
    for (const state of ['start', 'overview']) {
      await mkdir(dirname(join(baselineRoot, `${state}.png`)), { recursive: true });
      await copyFile(seed.store.resolveRunPath(`browser/workspace/design-1512/${state}/actual.png`), join(baselineRoot, `${state}.png`));
    }

    const result = await run('visual-state-compare', {
      setup,
      routes,
      visualSmoke: [
        { id: 'workspace-start', route: 'workspace', viewport: 'design-1512', state: 'start', baselineRoot, baseline: 'start.png' },
        { id: 'workspace-overview', route: 'workspace', viewport: 'design-1512', state: 'overview', baselineRoot, baseline: 'overview.png' }
      ]
    });

    const visualChecks = result.checks.filter((check) => check.suite === 'visual');
    expect(visualChecks.map((check) => [check.id, check.status, check.metadata.classification, check.metadata.state])).toEqual([
      ['visual.workspace-start', 'pass', 'visual-match', 'start'],
      ['visual.workspace-overview', 'pass', 'visual-match', 'overview']
    ]);
  }, 40_000);
});

describe('network fixtures', () => {
  it('serves error responses once, then falls back to the earlier stub', async () => {
    const result = await run('network-once', {
      setup: {
        network: {
          stubs: [candidatesStub, { method: 'GET', url: '**/api/candidates', status: 500, once: true }],
          unmatched: 'fail'
        }
      },
      routes: [{ id: 'workspace', path: '/workspace', viewports: ['desktop'], expects: [{ text: 'Could not load candidates' }] }]
    });

    expect(result.checks[0]).toMatchObject({ status: 'pass' });
    const network = (result.checks[0]?.metadata.setup as { network: { stubs: Array<{ hits: number; once: boolean }> } }).network;
    expect(network.stubs.map((stub) => [stub.once, stub.hits])).toEqual([[false, 0], [true, 1]]);
  }, 20_000);

  it('fails the state and lists unstubbed API requests when unmatched is fail', async () => {
    const result = await run('network-unmatched-fail', {
      setup: { network: { stubs: [], unmatched: 'fail' } },
      routes: [{ id: 'workspace', path: '/workspace', viewports: ['desktop'], expects: [{ role: 'heading', name: 'Workspace' }] }]
    });

    expect(result.checks[0]).toMatchObject({ status: 'fail', metadata: { classification: 'unexpected-network-request' } });
    expect(result.checks[0]?.details).toContain(`GET ${baseUrl}/api/candidates`);
  }, 20_000);

  it('only warns about unmatched requests when unmatched is warn', async () => {
    const result = await run('network-unmatched-warn', {
      setup: { network: { stubs: [], unmatched: 'warn' } },
      routes: [{ id: 'workspace', path: '/workspace', viewports: ['desktop'], expects: [] }]
    });

    expect(result.checks[0]).toMatchObject({ status: 'warn', severity: 'review' });
  }, 20_000);

  it('rejects stub files outside the config directory', async () => {
    const result = await run('network-escape', {
      setup: { network: { stubs: [{ url: '**/api/candidates', file: '../../package.json' }] } },
      routes: [{ id: 'workspace', path: '/workspace', viewports: ['desktop'], expects: [] }]
    });

    expect(result.checks[0]).toMatchObject({ status: 'fail' });
    expect(result.checks[0]?.summary).toContain('escapes the config directory');
  }, 20_000);
});

describe('fixed clock, locale and environment identity', () => {
  const routes = [
    {
      id: 'workspace',
      path: '/workspace',
      viewports: [designViewport],
      expects: [{ text: '3 oktober 2026' }, { screenshot: 'final' }]
    }
  ];
  const setup = {
    clock: { now: '2026-10-03T09:00:00+02:00' },
    timezone: 'Europe/Stockholm',
    locale: 'sv-SE',
    colorScheme: 'light' as const,
    reducedMotion: 'reduce' as const,
    network: { stubs: [candidatesStub], unmatched: 'fail' as const }
  };

  it('renders the fixed date in the configured locale and records the environment', async () => {
    const result = await run('clock', { setup, stability: { disableAnimations: true }, routes });

    expect(result.checks[0]).toMatchObject({
      status: 'pass',
      metadata: {
        environment: { locale: 'sv-SE', timezone: 'Europe/Stockholm', colorScheme: 'light', reducedMotion: 'reduce', deviceScaleFactor: 1, clockFixed: true }
      }
    });
    expect(result.browser?.name).toBe('chromium');
  }, 20_000);

  it('produces byte-identical screenshots across consecutive runs', async () => {
    const hashes: string[] = [];
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const result = await run(`clock-repeat-${attempt}`, { setup, stability: { disableAnimations: true }, routes });
      const png = await readFile(result.store.resolveRunPath('browser/workspace/design-1512/actual.png'));
      hashes.push(createHash('sha256').update(png).digest('hex'));
    }

    expect(new Set(hashes).size).toBe(1);
  }, 40_000);
});
