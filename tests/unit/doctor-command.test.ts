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
