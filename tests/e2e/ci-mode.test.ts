import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CommanderError } from 'commander';
import { describe, expect, it, vi } from 'vitest';
import { createCli } from '../../src/cli.js';
import { ExitCode } from '../../src/core/exit-codes.js';
import type { ReflectionReport } from '../../src/core/report-schema.js';

type CliResult = {
  stdout: string;
  stderr: string;
  exitCode?: number;
};

async function makeTempDir(name: string): Promise<string> {
  const dir = join(tmpdir(), `${name}-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  await mkdir(dir, { recursive: true });
  return dir;
}

async function runCli(args: string[], cwd: string): Promise<CliResult> {
  const program = createCli();
  let stdout = '';
  let stderr = '';
  let exitCode: number | undefined;
  const previousCwd = process.cwd();
  const originalLog = console.log;
  const originalError = console.error;

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
  vi.spyOn(console, 'log').mockImplementation((...values: unknown[]) => {
    stdout += `${values.join(' ')}\n`;
  });
  vi.spyOn(console, 'error').mockImplementation((...values: unknown[]) => {
    stderr += `${values.join(' ')}\n`;
  });

  try {
    process.chdir(cwd);
    await program.parseAsync(['node', 'reflection', ...args], { from: 'node' });
  } catch (error) {
    if (error instanceof CommanderError) {
      exitCode = error.exitCode;
    } else {
      throw error;
    }
  } finally {
    process.chdir(previousCwd);
    console.log = originalLog;
    console.error = originalError;
  }

  return { stdout, stderr, exitCode };
}

async function readLatestReport(root: string): Promise<ReflectionReport> {
  const latest = (await readFile(join(root, 'artifacts/reflection/runs/latest'), 'utf8')).trim();
  const report = await readFile(join(root, 'artifacts/reflection/runs', latest, 'report.json'), 'utf8');
  return JSON.parse(report) as ReflectionReport;
}

describe('CI mode', () => {
  it('writes --ci run artifacts to artifacts/reflection and records stable CI defaults', async () => {
    const root = await makeTempDir('reflection-ci-mode');

    const result = await runCli(['run', '--ci', '--mode', 'design'], root);
    const report = await readLatestReport(root);

    expect(result.exitCode).toBeUndefined();
    expect(result.stdout).toContain('Report: artifacts/reflection/runs/');
    expect(report.ci).toBe(true);
    expect(report.environment.profile).toBe('ci');
    expect(report.environment.workers).toBe(1);
    await expect(stat(join(root, 'artifacts/reflection/runs/latest'))).resolves.toBeTruthy();
  });

  it('keeps baselines untouched during --ci runs', async () => {
    const root = await makeTempDir('reflection-ci-mode-baselines');
    const baselinePath = join(root, 'baselines/browser/login/mobile.png');
    await mkdir(join(root, 'baselines/browser/login'), { recursive: true });
    await writeFile(baselinePath, 'BASELINE-BEFORE', 'utf8');

    const result = await runCli(['run', '--ci', '--mode', 'design'], root);

    expect(result.exitCode).toBeUndefined();
    await expect(readFile(baselinePath, 'utf8')).resolves.toBe('BASELINE-BEFORE');
  });

  it('rejects malformed --workers values instead of coercing them', async () => {
    const root = await makeTempDir('reflection-ci-mode-workers');

    const result = await runCli(['run', '--ci', '--mode', 'design', '--workers', '2abc'], root);

    expect(result.exitCode).toBe(ExitCode.InvalidUsage);
    expect(result.stderr).toContain('Invalid workers');
    await expect(stat(join(root, 'artifacts/reflection/runs/latest'))).rejects.toThrow();
  });

  it('returns invalid usage when --workers is missing a value', async () => {
    const root = await makeTempDir('reflection-ci-mode-workers-missing');

    const result = await runCli(['run', '--ci', '--mode', 'design', '--workers'], root);

    expect(result.exitCode).toBe(ExitCode.InvalidUsage);
    expect(result.stderr).toContain('Invalid workers');
    await expect(stat(join(root, 'artifacts/reflection/runs/latest'))).rejects.toThrow();
  });

  it('documents public CI exit codes and baseline update policy', async () => {
    const docs = await readFile('docs/ci.md', 'utf8');

    expect(docs).toContain('reflection run --ci');
    expect(docs).toContain('artifacts/reflection');
    expect(docs).toContain('Exit code');
    expect(docs).toContain(`${ExitCode.Success}`);
    expect(docs).toContain(`${ExitCode.BlockingFailure}`);
    expect(docs).toContain(`${ExitCode.ToolOrConfigError}`);
    expect(docs).toContain(`${ExitCode.InvalidUsage}`);
    expect(docs).toContain('CI never updates baselines');
  });

  it('ships a GitHub Actions workflow example for CI-safe validation', async () => {
    const workflow = await readFile('.github/workflows/reflection.yml', 'utf8');

    expect(workflow).toContain('reflection run --ci');
    expect(workflow).toContain('artifacts/reflection');
    expect(workflow).toContain('actions/upload-artifact');
    expect(workflow).not.toContain('reflection update');
  });
});
