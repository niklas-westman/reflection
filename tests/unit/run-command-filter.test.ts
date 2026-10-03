import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CommanderError } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runCommand } from '../../src/commands/run.js';
import { ExitCode } from '../../src/core/exit-codes.js';

async function writeConfig(): Promise<string> {
  const dir = join(tmpdir(), `reflection-run-filter-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  await mkdir(dir, { recursive: true });
  const configPath = join(dir, 'reflection.config.mjs');
  await writeFile(
    configPath,
    `export default { project: 'filter', contracts: { browser: { baseUrl: 'http://127.0.0.1:1', routes: [{ id: 'login', path: '/login' }] } } };`,
    'utf8'
  );
  return configPath;
}

describe('runCommand filters', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('exits with the documented code when the filters match nothing', async () => {
    const config = await writeConfig();

    const failure = await runCommand({ config, mode: 'smoke', route: ['nope'] }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(CommanderError);
    expect((failure as CommanderError).exitCode).toBe(ExitCode.FilterMatchedNothing);
    expect(ExitCode.FilterMatchedNothing).toBe(66);
    expect(console.error).toHaveBeenCalledWith('Warning: no route named "nope" in the config.');
  });

  it('requires a config when filters are given', async () => {
    const failure = await runCommand({ mode: 'smoke', case: ['x'] }).catch((error: unknown) => error);

    expect((failure as CommanderError).exitCode).toBe(ExitCode.InvalidUsage);
  });
});
