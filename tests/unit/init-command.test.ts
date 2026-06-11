import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CommanderError } from 'commander';
import { describe, expect, it, vi } from 'vitest';
import { initCommand } from '../../src/commands/init.js';
import { ExitCode } from '../../src/core/exit-codes.js';

async function makeTempDir(): Promise<string> {
  const dir = join(tmpdir(), `reflection-init-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  await mkdir(dir, { recursive: true });
  return dir;
}

async function captureInit(options: Parameters<typeof initCommand>[0]): Promise<string> {
  let stdout = '';
  const originalLog = console.log;
  vi.spyOn(console, 'log').mockImplementation((...values: unknown[]) => {
    stdout += `${values.join(' ')}\n`;
  });

  try {
    await initCommand(options);
  } finally {
    console.log = originalLog;
  }

  return stdout;
}

describe('initCommand', () => {
  it('prints a read-only pnpm vite-react setup plan without writing files', async () => {
    const cwd = await makeTempDir();
    await writeFile(join(cwd, 'package.json'), '{"scripts":{}}\n', 'utf8');
    await writeFile(join(cwd, 'pnpm-lock.yaml'), 'lockfileVersion: 9.0\n', 'utf8');

    const before = await readdir(cwd);
    const output = await captureInit({ cwd, dryRun: true, preset: 'vite-react' });
    const after = await readdir(cwd);

    expect(output).toContain('Reflection init');
    expect(output).toContain('Dry run: yes');
    expect(output).toContain('Package manager: pnpm');
    expect(output).toContain('Install: pnpm add -D reflection-check');
    expect(output).toContain('Would create: reflection.config.ts');
    expect(output).toContain('Would suggest script: "reflection": "reflection run --config reflection.config.ts --mode smoke"');
    expect(output).toContain('Preset: vite-react');
    expect(after.sort()).toEqual(before.sort());
  });

  it('requires dry-run before producing an init plan', async () => {
    const cwd = await makeTempDir();

    await expect(initCommand({ cwd, preset: 'vite-react' })).rejects.toMatchObject({
      exitCode: ExitCode.InvalidUsage,
      code: 'reflection.init'
    } satisfies Partial<CommanderError>);
  });

  it('rejects unsupported presets', async () => {
    const cwd = await makeTempDir();

    await expect(initCommand({ cwd, dryRun: true, preset: 'unknown' })).rejects.toMatchObject({
      exitCode: ExitCode.InvalidUsage,
      code: 'reflection.init'
    } satisfies Partial<CommanderError>);
  });
});
