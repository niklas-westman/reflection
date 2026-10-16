import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CommanderError } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { doctorCommand } from '../../src/commands/doctor.js';
import { ExitCode } from '../../src/core/exit-codes.js';

async function makeTempDir(): Promise<string> {
  const dir = join(tmpdir(), `reflection-doctor-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  await mkdir(dir, { recursive: true });
  return dir;
}

async function writeConfig(source: string): Promise<string> {
  const dir = await makeTempDir();
  const configPath = join(dir, 'reflection.config.mjs');
  await writeFile(configPath, source, 'utf8');
  return configPath;
}

async function captureDoctor(options: Parameters<typeof doctorCommand>[0] = {}): Promise<string> {
  let stdout = '';
  vi.spyOn(console, 'log').mockImplementation((...values: unknown[]) => {
    stdout += `${values.join(' ')}\n`;
  });

  await doctorCommand(options);

  return stdout;
}

describe('doctorCommand', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('prints runtime readiness without requiring a config', async () => {
    const output = await captureDoctor();

    expect(output).toContain('Reflection doctor');
    expect(output).toContain('Status: pass');
    expect(output).toContain(`Node: ${process.version}`);
    expect(output).toContain('Playwright package: available');
    expect(output).toContain('Config: not provided');
  });

  it('validates an explicit config and prints a concise project summary', async () => {
    const configPath = await writeConfig(`
      export default {
        project: 'doctor-fixture',
        contracts: {
          browser: {
            enabled: true,
            baseUrl: 'http://127.0.0.1:4173',
            server: {
              command: 'pnpm dev --host 127.0.0.1',
              readyUrl: 'http://127.0.0.1:4173',
              reuseExisting: true,
              timeoutMs: 45000
            },
            routes: [
              { id: 'home', path: '/', viewports: ['desktop'] },
              { id: 'login', path: '/login', viewports: ['mobile'] }
            ],
            visualSmoke: [
              { id: 'home-desktop', route: 'home', viewport: 'desktop', baseline: 'browser/home/desktop.png' }
            ]
          },
          design: {
            enabled: true,
            commands: [{ id: 'tokens', command: 'pnpm check:tokens' }]
          }
        }
      };
    `);

    const output = await captureDoctor({ config: configPath });

    expect(output).toContain(`Config: ${configPath}`);
    expect(output).toContain('Project: doctor-fixture');
    expect(output).toContain('Browser contract: enabled, 2 routes, 1 visual smoke case');
    expect(output).toContain('Base URL: http://127.0.0.1:4173');
    expect(output).toContain('Server: configured, readyUrl http://127.0.0.1:4173, reuseExisting true, timeoutMs 45000');
    expect(output).toContain('Server reachability: not checked; doctor does not start servers');
    expect(output).toContain('Design contract: enabled, 1 command');
    expect(output).not.toContain('placeholder');
  });

  it('prints custom route viewports with their sizes', async () => {
    const configPath = await writeConfig(`
      export default {
        project: 'viewport-fixture',
        contracts: {
          browser: {
            baseUrl: 'http://127.0.0.1:4173',
            routes: [
              { id: 'login', path: '/login', viewports: ['mobile', { name: 'design-1512', width: 1512, height: 982 }] }
            ]
          }
        }
      };
    `);

    const output = await captureDoctor({ config: configPath });

    expect(output).toContain('Route login viewports: mobile, design-1512 (1512x982)');
  });

  it('prints route states, network fixtures and environment setup', async () => {
    const configPath = await writeConfig(`
      export default {
        project: 'states-fixture',
        contracts: {
          browser: {
            baseUrl: 'http://127.0.0.1:4173',
            setup: { network: { stubs: [{ method: 'GET', url: '**/api/candidates', file: 'fixtures/c.json' }, { url: '**/api/x', status: 500, once: true }], unmatched: 'fail' } },
            routes: [
              {
                id: 'my-work',
                path: '/my-work',
                setup: { clock: { now: '2026-10-03T09:00:00+02:00' }, locale: 'sv-SE' },
                states: [{ id: 'start' }, { id: 'overview', path: '/my-work/luna', steps: [{ click: { role: 'button', name: 'Luna' } }], setup: { network: { stubs: [{ url: '**/api/y', status: 404 }] } } }]
              }
            ]
          }
        }
      };
    `);

    const output = await captureDoctor({ config: configPath });

    expect(output).toContain('Route my-work states: start (0 steps), overview (1 step, path /my-work/luna)');
    expect(output).toContain('State my-work.overview network: 1 stub, unmatched allow');
    expect(output).toContain('Browser network: 2 stubs, unmatched fail');
    expect(output).toContain('GET **/api/candidates -> 200 (file fixtures/c.json)');
    expect(output).toContain('ANY **/api/x -> 500 (empty, once)');
    expect(output).toContain('Route my-work environment: clock 2026-10-03T09:00:00+02:00, locale sv-SE');
  });

  it('validates configured text diagnostics bundles offline and reports their state', async () => {
    const fixtureBundle = join(process.cwd(), 'tests/fixtures/text-diagnostics/inter-label/bundle.json');
    const configPath = await writeConfig(`
      export default {
        project: 'text-fixture',
        contracts: {
          component: {
            storybook: { command: 'x', readyUrl: 'http://127.0.0.1:6006' },
            cases: [
              { id: 'refresh', storyId: 'button--refresh', baseline: 'refresh.webp', textDiagnostics: { source: ${JSON.stringify(fixtureBundle)}, parts: [{ id: 'refresh-label', selector: '.label' }] } },
              { id: 'broken', storyId: 'button--broken', baseline: 'broken.webp', textDiagnostics: { source: './missing/bundle.json', parts: [{ id: 'a', selector: '.a' }] } }
            ]
          }
        }
      };
    `);

    const output = await captureDoctor({ config: configPath });

    expect(output).toContain('Text diagnostics refresh:');
    expect(output).toContain('1 part, bundle valid (live-diagnostic, version unknown, identity caller-attested, 2 outlines)');
    expect(output).toContain('Text diagnostics broken: source ./missing/bundle.json, 1 part, bundle invalid: The bundle file does not exist');
  });

  it('prints the effective capture policy for component cases that declare one', async () => {
    const configPath = await writeConfig(`
      export default {
        project: 'capture-fixture',
        contracts: {
          component: {
            storybook: { command: 'x', readyUrl: 'http://127.0.0.1:6006' },
            cases: [
              { id: 'pressed', storyId: 'b--p', baseline: 'p.webp', browserState: { kind: 'pressed', selector: '.btn' }, stabilization: { animations: 'settle', settleMs: 20 } },
              { id: 'legacy-hover', storyId: 'b--h', baseline: 'h.webp', browserState: { kind: 'hover', selector: '.btn', animationStabilization: { disableAnimations: true } } },
              { id: 'static', storyId: 'b--s', baseline: 's.webp', stabilization: { animations: 'none', verify: false } },
              { id: 'plain', storyId: 'b--d', baseline: 'd.webp' }
            ]
          }
        }
      };
    `);

    const output = await captureDoctor({ config: configPath });

    expect(output).toContain('Capture policy pressed: interaction pressed on .btn, stabilization web-animations-settle (source case, settle 20ms, verify on, 100ms apart)');
    expect(output).toContain('Capture policy legacy-hover: interaction hover on .btn, stabilization css-none (source browser-state, settle 0ms, verify off)');
    expect(output).toContain('Capture policy static: interaction none, stabilization css-none (source case, settle 0ms, verify off)');
    expect(output).not.toContain('Capture policy plain');
  });

  it('summarizes portal component runtime and ready URL', async () => {
    const configPath = await writeConfig(`
      export default {
        project: 'portal-fixture',
        contracts: {
          component: {
            portal: {
              entry: './tests/reflection/react-portal.tsx',
              readyUrl: 'http://127.0.0.1:6106'
            },
            cases: [
              {
                id: 'button-primary',
                path: '/reflection/button/primary/light',
                viewportSize: { width: 390, height: 220 },
                baseline: 'components/button-primary.png'
              }
            ]
          }
        }
      };
    `);

    const output = await captureDoctor({ config: configPath });

    expect(output).toContain('Component contract: enabled, 1 case, runtime portal');
    expect(output).toContain('Component portal: readyUrl http://127.0.0.1:6106, reuseExisting true, timeoutMs 60000');
  });

  it('exits non-zero when an explicit config is missing', async () => {
    const missingPath = join(tmpdir(), `reflection-missing-${Date.now()}.config.mjs`);

    await expect(doctorCommand({ config: missingPath })).rejects.toMatchObject({
      exitCode: ExitCode.ToolOrConfigError,
      code: 'reflection.doctor'
    });
  });

  it('exits non-zero when an explicit config is invalid', async () => {
    const configPath = await writeConfig(`
      export default {
        project: '',
        contracts: {
          browser: {
            baseUrl: 'not-a-url',
            routes: []
          }
        }
      };
    `);

    await expect(doctorCommand({ config: configPath })).rejects.toSatisfy((error) => {
      expect(error).toBeInstanceOf(CommanderError);
      expect((error as CommanderError).exitCode).toBe(ExitCode.ToolOrConfigError);
      expect((error as Error).message).toContain('Invalid Reflection config');
      return true;
    });
  });
});
