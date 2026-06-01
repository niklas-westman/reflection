import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createCli } from '../../src/cli.js';
import { ExitCode } from '../../src/core/exit-codes.js';
import { createReport, type CheckResult } from '../../src/core/report-schema.js';

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

  it('wires review --json through the CLI', async () => {
    const root = await makeReviewReportRoot();
    const result = await runCli(['review', '--report-dir', root, '--run', 'cli-review-run', '--json']);
    const parsed = JSON.parse(result.stdout) as { status: string; runId: string; reviewItems: Array<{ id: string }> };

    expect(result.exitCode).toBeUndefined();
    expect(parsed.runId).toBe('cli-review-run');
    expect(parsed.status).toBe('pass-with-review');
    expect(parsed.reviewItems.map((item) => item.id)).toEqual(['visual.login-mobile']);
  });

  it('wires update --route --from-run --dry-run through the CLI without mutating baselines', async () => {
    const fixture = await makeUpdateFixture();

    const result = await runCli([
      'update',
      '--config',
      fixture.configPath,
      '--report-dir',
      fixture.reportRoot,
      '--from-run',
      'latest',
      '--route',
      'login',
      '--dry-run'
    ]);

    expect(result.exitCode).toBeUndefined();
    expect(result.stdout).toContain('Reflection update');
    expect(result.stdout).toContain('Dry run: yes');
    await expect(readFile(fixture.baselinePath, 'utf8')).resolves.toBe('OLD-BASELINE');
  });
});

async function makeReviewReportRoot(): Promise<string> {
  const root = join(tmpdir(), `reflection-cli-review-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const runDir = join(root, 'runs', 'cli-review-run');
  await mkdir(runDir, { recursive: true });
  await writeFile(join(runDir, 'report.json'), `${JSON.stringify(createReviewReport(), null, 2)}\n`, 'utf8');
  return root;
}

function createReviewReport() {
  return createReport({
    runId: 'cli-review-run',
    project: 'cli-review-fixture',
    startedAt: new Date('2026-05-31T12:00:00.000Z'),
    finishedAt: new Date('2026-05-31T12:00:01.000Z'),
    mode: 'smoke',
    ci: false,
    checks: [
      check({ id: 'browser.login.mobile', status: 'pass', severity: 'blocking' }),
      check({ id: 'visual.login-mobile', suite: 'visual', status: 'warn', severity: 'review', summary: 'Visual changed.' })
    ]
  });
}

function check(overrides: Partial<CheckResult>): CheckResult {
  return {
    id: 'browser.login.mobile',
    suite: 'browser',
    target: '/login mobile',
    status: 'pass',
    severity: 'blocking',
    summary: 'Login mobile passed.',
    artifacts: [],
    metadata: {},
    ...overrides
  };
}

async function makeUpdateFixture(): Promise<{ configPath: string; reportRoot: string; baselinePath: string }> {
  const root = join(tmpdir(), `reflection-cli-update-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const reportRoot = join(root, 'artifacts');
  const baselineRoot = join(root, 'baselines');
  const baselinePath = join(baselineRoot, 'browser/login/mobile.png');
  const runDir = join(reportRoot, 'runs', 'cli-update-run');
  await mkdir(join(baselineRoot, 'browser/login'), { recursive: true });
  await mkdir(join(runDir, 'visual/login-mobile'), { recursive: true });
  await writeFile(baselinePath, 'OLD-BASELINE', 'utf8');
  await writeFile(join(runDir, 'visual/login-mobile/actual.png'), 'NEW-ACTUAL', 'utf8');
  await writeFile(
    join(runDir, 'report.json'),
    `${JSON.stringify(
      createReport({
        runId: 'cli-update-run',
        project: 'cli-update-fixture',
        startedAt: new Date('2026-05-31T12:00:00.000Z'),
        finishedAt: new Date('2026-05-31T12:00:01.000Z'),
        mode: 'smoke',
        ci: false,
        checks: [
          check({
            id: 'visual.login-mobile',
            suite: 'visual',
            status: 'warn',
            severity: 'review',
            artifacts: [{ type: 'image', role: 'actual', path: 'visual/login-mobile/actual.png' }],
            metadata: { routeId: 'login', viewport: 'mobile', baselinePath: 'browser/login/mobile.png' }
          })
        ]
      }),
      null,
      2
    )}\n`,
    'utf8'
  );
  await writeFile(join(reportRoot, 'runs', 'latest'), 'cli-update-run\n', 'utf8');

  const configPath = join(root, 'reflection.config.mjs');
  await writeFile(
    configPath,
    `export default {
      project: 'cli-update-fixture',
      contracts: {
        browser: {
          baseUrl: 'http://127.0.0.1:4173',
          routes: [],
          visualSmoke: [{ id: 'login-mobile', route: 'login', viewport: 'mobile', baselineRoot: ${JSON.stringify(baselineRoot)}, baseline: 'browser/login/mobile.png' }]
        }
      }
    };\n`,
    'utf8'
  );

  return { configPath, reportRoot, baselinePath };
}
