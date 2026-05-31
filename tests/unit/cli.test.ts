import { describe, expect, it, vi } from 'vitest';
import { createCli } from '../../src/cli.js';
import { ExitCode } from '../../src/core/exit-codes.js';

type CliResult = {
  stdout: string;
  stderr: string;
  exitCode?: number;
};

async function runCli(args: string[]): Promise<CliResult> {
  const program = createCli();
  let stdout = '';
  let stderr = '';
  let exitCode: number | undefined;

  program.exitOverride((error) => {
    exitCode = error.exitCode;
    throw error;
  });
  program.configureOutput({
    writeOut: (value) => {
      stdout += value;
    },
    writeErr: (value) => {
      stderr += value;
    }
  });

  const originalLog = console.log;
  const originalError = console.error;
  vi.spyOn(console, 'log').mockImplementation((...values: unknown[]) => {
    stdout += `${values.join(' ')}\n`;
  });
  vi.spyOn(console, 'error').mockImplementation((...values: unknown[]) => {
    stderr += `${values.join(' ')}\n`;
  });

  try {
    await program.parseAsync(['node', 'reflection', ...args], { from: 'node' });
  } catch (error) {
    if (error instanceof Error && error.name === 'CommanderError') {
      const maybeCommanderError = error as Error & { exitCode?: number };
      exitCode = maybeCommanderError.exitCode;
    } else {
      throw error;
    }
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }

  return { stdout, stderr, exitCode };
}

describe('reflection CLI', () => {
  it('uses standalone reflection command identity', async () => {
    const result = await runCli(['--help']);

    expect(result.stdout).toContain('Usage: reflection');
    expect(result.stdout.toLowerCase()).not.toContain('greenhouse');
  });

  it('returns usage exit code for an invalid mode', async () => {
    const result = await runCli(['run', '--mode', 'unknown']);

    expect(result.exitCode).toBe(ExitCode.InvalidUsage);
    expect(result.stderr).toContain('Invalid mode');
  });

  it('returns tool/config error when an explicit config file is missing', async () => {
    const result = await runCli(['run', '--config', '/tmp/reflection-missing.config.mjs']);

    expect(result.exitCode).toBe(ExitCode.ToolOrConfigError);
    expect(result.stderr).toContain('Reflection config not found');
  });

  it('doctor prints a concise setup check placeholder', async () => {
    const result = await runCli(['doctor']);

    expect(result.exitCode).toBeUndefined();
    expect(result.stdout).toContain('Reflection doctor');
  });
});
