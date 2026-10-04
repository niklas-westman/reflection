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

describe('exact and visible matching', () => {
  const route = (expects: unknown[], states?: unknown[]) => ({
    id: 'workspace',
    path: '/workspace',
    viewports: ['desktop'],
    expects: states ? [] : expects,
    ...(states ? { states } : {})
  });
  const stubbed = { network: { stubs: [candidatesStub] } };

  async function firstCheck(runId: string, expects: unknown[]) {
    const result = await run(runId, { setup: stubbed, routes: [route(expects) as never] });
    return result.checks[0];
  }

  it('does not let a partial name satisfy a role expectation, unless exact is false', async () => {
    const exact = await firstCheck('exact-default', [{ role: 'button', name: 'Sign in' }]);
    expect(exact).toMatchObject({ status: 'fail' });
    expect(exact?.summary).toContain('Expected visible role button named "Sign in" (exact), but nothing matched.');

    const partial = await firstCheck('exact-false', [{ role: 'button', name: 'Sign in', exact: false }]);
    expect(partial?.status).toBe('pass');
    expect(await firstCheck('exact-full', [{ role: 'button', name: 'Sign in elsewhere' }])).toMatchObject({ status: 'pass' });
  }, 40_000);

  it('requires matches to be visible by default and enabled on request', async () => {
    expect((await firstCheck('hidden-role-default', [{ role: 'button', name: 'Hidden action' }]))?.status).toBe('fail');
    const hidden = await firstCheck('hidden-label-default', [{ label: 'Hidden field' }]);
    expect(hidden).toMatchObject({ status: 'fail' });
    expect(hidden?.summary).toContain('none of the 1 matching element was visible');
    expect((await firstCheck('hidden-label-opt-out', [{ label: 'Hidden field', visible: false }]))?.status).toBe('pass');

    expect((await firstCheck('hidden-opt-out', [{ role: 'button', name: 'Hidden action', visible: false }]))?.status).toBe('pass');
    expect((await firstCheck('disabled-default', [{ role: 'button', name: 'Archive' }]))?.status).toBe('pass');
    const disabled = await firstCheck('disabled-enabled', [{ role: 'button', name: 'Archive', enabled: true }]);
    expect(disabled).toMatchObject({ status: 'fail' });
    expect(disabled?.summary).toContain('visible and enabled');
  }, 40_000);

  it('keeps text a visible substring match by default', async () => {
    expect((await firstCheck('text-substring', [{ text: 'Sign in else' }]))?.status).toBe('pass');
    expect((await firstCheck('text-exact', [{ text: 'Sign in else', exact: true }]))?.status).toBe('fail');
  }, 30_000);

  it('matches step labels exactly so a toggle named "Show password" is not the Password field', async () => {
    const states = (exact?: boolean) => [
      { id: 'type', steps: [{ fill: { label: 'Password', value: 'secret', ...(exact === undefined ? {} : { exact }) } }], expects: [] }
    ];
    const strictResult = await run('step-exact', { setup: stubbed, routes: [route([], states()) as never] });
    expect(strictResult.checks[0]?.status).toBe('pass');

    const looseResult = await run('step-substring', { setup: stubbed, routes: [route([], states(false)) as never] });
    expect(looseResult.checks[0]).toMatchObject({ status: 'fail', metadata: { classification: 'step-failure' } });
  }, 40_000);
});

describe('report evidence, state setup, state paths and masks', () => {
  it('records the final URL and a result per expectation in the check metadata', async () => {
    const result = await run('evidence', {
      setup: { network: { stubs: [candidatesStub] } },
      routes: [
        {
          id: 'workspace',
          path: '/workspace?access_token=abc123&tab=1',
          viewports: ['desktop'],
          expects: [{ role: 'heading', name: 'Workspace' }, { role: 'button', name: 'Nope' }, { noConsoleErrors: true }]
        }
      ]
    });

    const check = result.checks[0];
    expect(check?.metadata.finalUrl).toBe(`${baseUrl}/workspace?access_token=%5BREDACTED%5D&tab=1`);
    expect(check?.metadata.expectations).toEqual([
      { expectation: 'visible role heading named "Workspace" (exact)', status: 'pass' },
      { expectation: expect.stringContaining('role button named "Nope"'), status: 'fail', message: expect.stringContaining('nothing matched') },
      { expectation: 'noConsoleErrors true', status: 'pass' }
    ]);
  }, 20_000);

  it('applies state setup on top of browser and route setup', async () => {
    const result = await run('state-setup', {
      setup: { network: { stubs: [candidatesStub], unmatched: 'fail' } },
      routes: [
        {
          id: 'workspace',
          path: '/workspace',
          viewports: ['desktop'],
          expects: [],
          states: [
            { id: 'loaded', expects: [{ role: 'button', name: 'Luna Larsson' }] },
            {
              id: 'failed-load',
              setup: { network: { stubs: [{ method: 'GET', url: '**/api/candidates', status: 500 }] } },
              expects: [{ text: 'Could not load candidates' }]
            }
          ]
        }
      ]
    });

    expect(result.checks.map((check) => [check.id, check.status])).toEqual([
      ['browser.workspace.desktop.loaded', 'pass'],
      ['browser.workspace.desktop.failed-load', 'pass']
    ]);
  }, 30_000);

  it('lets a state start at its own path', async () => {
    const result = await run('state-path', {
      setup: { network: { stubs: [candidatesStub] } },
      routes: [
        {
          id: 'workspace',
          path: '/workspace',
          viewports: ['desktop'],
          expects: [],
          states: [
            { id: 'list', expects: [{ role: 'heading', name: 'Workspace' }] },
            { id: 'direct', path: '/login', expects: [{ role: 'heading', name: 'Login' }, { urlIncludes: '/login' }] }
          ]
        }
      ]
    });

    expect(result.checks.map((check) => [check.id, check.status, check.metadata.finalUrl])).toEqual([
      ['browser.workspace.desktop.list', 'pass', `${baseUrl}/workspace`],
      ['browser.workspace.desktop.direct', 'pass', `${baseUrl}/login`]
    ]);
    expect(result.checks[1]?.target).toBe('/login desktop direct');
  }, 30_000);

  it('adds route and state masks to browser masks and reports reasons and what was applied', async () => {
    const result = await run('masks', {
      maskSelectors: [{ selector: 'p', reason: 'date text' }],
      setup: { network: { stubs: [candidatesStub] } },
      routes: [
        {
          id: 'workspace',
          path: '/workspace',
          viewports: ['desktop'],
          maskSelectors: ['h1'],
          expects: [],
          states: [
            { id: 'plain', expects: [{ screenshot: 'final' }] },
            { id: 'masked', maskSelectors: [{ selector: '[aria-label="Account actions"]', reason: 'fixture noise' }, '.missing'], expects: [{ screenshot: 'final' }] }
          ]
        }
      ]
    });

    const [plain, masked] = result.checks;
    expect(plain?.metadata.masks).toEqual([
      { selector: 'p', reason: 'date text', applied: true },
      { selector: 'h1', applied: true }
    ]);
    expect(masked?.metadata.masks).toEqual([
      { selector: 'p', reason: 'date text', applied: true },
      { selector: 'h1', applied: true },
      { selector: '[aria-label="Account actions"]', reason: 'fixture noise', applied: true },
      { selector: '.missing', applied: false }
    ]);
  }, 30_000);
});

