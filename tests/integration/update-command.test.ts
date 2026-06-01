import { mkdir, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CommanderError } from 'commander';
import { describe, expect, it, vi } from 'vitest';
import { updateCommand } from '../../src/commands/update.js';
import { ExitCode } from '../../src/core/exit-codes.js';
import { createReport, type CheckResult } from '../../src/core/report-schema.js';

async function makeTempDir(name: string): Promise<string> {
  const dir = join(tmpdir(), `${name}-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  await mkdir(dir, { recursive: true });
  return dir;
}

async function writeFixtureConfig(root: string, baselineRoot: string): Promise<string> {
  const configPath = join(root, 'reflection.config.mjs');
  await writeFile(
    configPath,
    `export default {
      project: 'update-fixture',
      contracts: {
        browser: {
          baseUrl: 'http://127.0.0.1:4173',
          routes: [],
          visualSmoke: [
            {
              id: 'login-mobile',
              route: 'login',
              viewport: 'mobile',
              baselineRoot: ${JSON.stringify(baselineRoot)},
              baseline: 'browser/login/mobile.png'
            },
            {
              id: 'admin-mobile',
              route: 'admin',
              viewport: 'mobile',
              baselineRoot: ${JSON.stringify(baselineRoot)},
              baseline: 'browser/admin/mobile.png'
            }
          ]
        }
      }
    };\n`,
    'utf8'
  );
  return configPath;
}

async function writeRun(reportRoot: string, runId: string): Promise<void> {
  const runDir = join(reportRoot, 'runs', runId);
  await mkdir(join(runDir, 'visual/login-mobile'), { recursive: true });
  await mkdir(join(runDir, 'visual/admin-mobile'), { recursive: true });
  await writeFile(join(runDir, 'visual/login-mobile/actual.png'), 'LOGIN-ACTUAL', 'utf8');
  await writeFile(join(runDir, 'visual/admin-mobile/actual.png'), 'ADMIN-ACTUAL', 'utf8');
  await writeFile(join(runDir, 'report.json'), `${JSON.stringify(createUpdateReport(runId), null, 2)}\n`, 'utf8');
  await writeFile(join(reportRoot, 'runs', 'latest'), `${runId}\n`, 'utf8');
}

function createUpdateReport(runId: string) {
  return createReport({
    runId,
    project: 'update-fixture',
    startedAt: new Date('2026-05-31T12:00:00.000Z'),
    finishedAt: new Date('2026-05-31T12:00:01.000Z'),
    mode: 'smoke',
    ci: false,
    checks: [
      visualCheck('login-mobile', 'login', 'visual/login-mobile/actual.png'),
      visualCheck('admin-mobile', 'admin', 'visual/admin-mobile/actual.png')
    ]
  });
}

function visualCheck(id: string, routeId: string, actualPath: string): CheckResult {
  return {
    id: `visual.${id}`,
    suite: 'visual',
    target: `${routeId} mobile`,
    status: 'warn',
    severity: 'review',
    summary: `${id} changed.`,
    artifacts: [{ type: 'image', role: 'actual', path: actualPath }],
    metadata: {
      classification: 'visual-diff',
      routeId,
      viewport: 'mobile',
      baselinePath: `browser/${routeId}/mobile.png`
    }
  };
}

async function captureUpdate(options: Parameters<typeof updateCommand>[0]): Promise<string> {
  let stdout = '';
  const originalLog = console.log;
  vi.spyOn(console, 'log').mockImplementation((...values: unknown[]) => {
    stdout += `${values.join(' ')}\n`;
  });

  try {
    await updateCommand(options);
  } finally {
    console.log = originalLog;
  }

  return stdout;
}

describe('updateCommand', () => {
  it('dry-runs a targeted route update without writing the baseline', async () => {
    const root = await makeTempDir('reflection-update');
    const reportRoot = join(root, 'artifacts');
    const baselineRoot = join(root, 'baselines');
    await mkdir(join(baselineRoot, 'browser/login'), { recursive: true });
    await writeFile(join(baselineRoot, 'browser/login/mobile.png'), 'OLD-BASELINE', 'utf8');
    await mkdir(join(reportRoot, 'runs'), { recursive: true });
    await writeRun(reportRoot, 'update-run');
    const configPath = await writeFixtureConfig(root, baselineRoot);

    const stdout = await captureUpdate({ config: configPath, reportDir: reportRoot, fromRun: 'latest', route: 'login', dryRun: true });

    expect(stdout).toContain('Reflection update');
    expect(stdout).toContain('Dry run: yes');
    expect(stdout).toContain('visual.login-mobile');
    expect(stdout).not.toContain('visual.admin-mobile');
    await expect(readFile(join(baselineRoot, 'browser/login/mobile.png'), 'utf8')).resolves.toBe('OLD-BASELINE');
  });

  it('copies only the selected actual screenshot into the selected baseline path', async () => {
    const root = await makeTempDir('reflection-update');
    const reportRoot = join(root, 'artifacts');
    const baselineRoot = join(root, 'baselines');
    await mkdir(join(baselineRoot, 'browser/login'), { recursive: true });
    await writeFile(join(baselineRoot, 'browser/login/mobile.png'), 'OLD-LOGIN', 'utf8');
    await mkdir(join(baselineRoot, 'browser/admin'), { recursive: true });
    await writeFile(join(baselineRoot, 'browser/admin/mobile.png'), 'OLD-ADMIN', 'utf8');
    await mkdir(join(reportRoot, 'runs'), { recursive: true });
    await writeRun(reportRoot, 'update-run');
    const configPath = await writeFixtureConfig(root, baselineRoot);

    await captureUpdate({ config: configPath, reportDir: reportRoot, fromRun: 'update-run', route: 'login' });

    await expect(readFile(join(baselineRoot, 'browser/login/mobile.png'), 'utf8')).resolves.toBe('LOGIN-ACTUAL');
    await expect(readFile(join(baselineRoot, 'browser/admin/mobile.png'), 'utf8')).resolves.toBe('OLD-ADMIN');
  });

  it('refuses baseline updates in CI mode', async () => {
    const root = await makeTempDir('reflection-update');
    const reportRoot = join(root, 'artifacts');
    const baselineRoot = join(root, 'baselines');
    await mkdir(join(reportRoot, 'runs'), { recursive: true });
    await writeRun(reportRoot, 'update-run');
    const configPath = await writeFixtureConfig(root, baselineRoot);

    await expect(updateCommand({ config: configPath, reportDir: reportRoot, fromRun: 'latest', route: 'login', ci: true })).rejects.toMatchObject({
      exitCode: ExitCode.ToolOrConfigError,
      code: 'reflection.update'
    } satisfies Partial<CommanderError>);
  });

  it('refuses baseline updates when CI is any truthy environment value', async () => {
    const root = await makeTempDir('reflection-update');
    const reportRoot = join(root, 'artifacts');
    const baselineRoot = join(root, 'baselines');
    await mkdir(join(reportRoot, 'runs'), { recursive: true });
    await writeRun(reportRoot, 'update-run');
    const configPath = await writeFixtureConfig(root, baselineRoot);
    const previousCi = process.env.CI;
    process.env.CI = '1';

    try {
      await expect(updateCommand({ config: configPath, reportDir: reportRoot, fromRun: 'latest', route: 'login' })).rejects.toMatchObject({
        exitCode: ExitCode.ToolOrConfigError,
        code: 'reflection.update'
      } satisfies Partial<CommanderError>);
    } finally {
      if (previousCi === undefined) {
        delete process.env.CI;
      } else {
        process.env.CI = previousCi;
      }
    }
  });

  it('refuses untargeted updates unless --all is explicit', async () => {
    const root = await makeTempDir('reflection-update');
    const reportRoot = join(root, 'artifacts');
    const baselineRoot = join(root, 'baselines');
    await mkdir(join(reportRoot, 'runs'), { recursive: true });
    await writeRun(reportRoot, 'update-run');
    const configPath = await writeFixtureConfig(root, baselineRoot);

    await expect(updateCommand({ config: configPath, reportDir: reportRoot, fromRun: 'latest' })).rejects.toMatchObject({
      exitCode: ExitCode.InvalidUsage,
      code: 'reflection.update'
    } satisfies Partial<CommanderError>);
  });

  it('refuses mixed --all and targeted selectors', async () => {
    const root = await makeTempDir('reflection-update');
    const reportRoot = join(root, 'artifacts');
    const baselineRoot = join(root, 'baselines');
    await mkdir(join(reportRoot, 'runs'), { recursive: true });
    await writeRun(reportRoot, 'update-run');
    const configPath = await writeFixtureConfig(root, baselineRoot);

    await expect(updateCommand({ config: configPath, reportDir: reportRoot, fromRun: 'latest', route: 'login', all: true })).rejects.toMatchObject({
      exitCode: ExitCode.InvalidUsage,
      code: 'reflection.update'
    } satisfies Partial<CommanderError>);
  });

  it('refuses a latest pointer that resolves outside the runs directory', async () => {
    const root = await makeTempDir('reflection-update');
    const reportRoot = join(root, 'artifacts');
    const baselineRoot = join(root, 'baselines');
    await mkdir(join(reportRoot, 'runs'), { recursive: true });
    await writeRun(reportRoot, 'update-run');
    await writeFile(join(root, 'outside-latest'), 'update-run\n', 'utf8');
    await rm(join(reportRoot, 'runs', 'latest'));
    await symlink(join(root, 'outside-latest'), join(reportRoot, 'runs', 'latest'));
    const configPath = await writeFixtureConfig(root, baselineRoot);

    await expect(updateCommand({ config: configPath, reportDir: reportRoot, fromRun: 'latest', route: 'login' })).rejects.toMatchObject({
      exitCode: ExitCode.ToolOrConfigError,
      code: 'reflection.update'
    } satisfies Partial<CommanderError>);
  });

  it('refuses to promote an actual artifact that resolves outside the selected run directory', async () => {
    const root = await makeTempDir('reflection-update');
    const reportRoot = join(root, 'artifacts');
    const baselineRoot = join(root, 'baselines');
    await mkdir(join(reportRoot, 'runs'), { recursive: true });
    await writeRun(reportRoot, 'update-run');
    await writeFile(join(root, 'outside-actual.png'), 'OUTSIDE-ACTUAL', 'utf8');
    const actualPath = join(reportRoot, 'runs', 'update-run', 'visual/login-mobile/actual.png');
    await rm(actualPath);
    await symlink(join(root, 'outside-actual.png'), actualPath);
    const configPath = await writeFixtureConfig(root, baselineRoot);

    await expect(updateCommand({ config: configPath, reportDir: reportRoot, fromRun: 'latest', route: 'login' })).rejects.toMatchObject({
      exitCode: ExitCode.ToolOrConfigError,
      code: 'reflection.update'
    } satisfies Partial<CommanderError>);
  });

  it('refuses a selected run directory that resolves outside the runs directory', async () => {
    const root = await makeTempDir('reflection-update');
    const reportRoot = join(root, 'artifacts');
    const outsideReportRoot = join(root, 'outside-artifacts');
    const baselineRoot = join(root, 'baselines');
    await mkdir(join(reportRoot, 'runs'), { recursive: true });
    await mkdir(join(outsideReportRoot, 'runs'), { recursive: true });
    await writeRun(outsideReportRoot, 'update-run');
    await symlink(join(outsideReportRoot, 'runs', 'update-run'), join(reportRoot, 'runs', 'update-run'), 'dir');
    await writeFile(join(reportRoot, 'runs', 'latest'), 'update-run\n', 'utf8');
    const configPath = await writeFixtureConfig(root, baselineRoot);

    await expect(updateCommand({ config: configPath, reportDir: reportRoot, fromRun: 'latest', route: 'login' })).rejects.toMatchObject({
      exitCode: ExitCode.ToolOrConfigError,
      code: 'reflection.update'
    } satisfies Partial<CommanderError>);
  });

  it('refuses a selected report file that resolves outside the selected run directory', async () => {
    const root = await makeTempDir('reflection-update');
    const reportRoot = join(root, 'artifacts');
    const outsideReportRoot = join(root, 'outside-artifacts');
    const baselineRoot = join(root, 'baselines');
    await mkdir(join(reportRoot, 'runs'), { recursive: true });
    await writeRun(reportRoot, 'update-run');
    await mkdir(outsideReportRoot, { recursive: true });
    await writeFile(join(outsideReportRoot, 'report.json'), `${JSON.stringify(createUpdateReport('update-run'), null, 2)}\n`, 'utf8');
    await rm(join(reportRoot, 'runs', 'update-run', 'report.json'));
    await symlink(join(outsideReportRoot, 'report.json'), join(reportRoot, 'runs', 'update-run', 'report.json'));
    const configPath = await writeFixtureConfig(root, baselineRoot);

    await expect(updateCommand({ config: configPath, reportDir: reportRoot, fromRun: 'latest', route: 'login' })).rejects.toMatchObject({
      exitCode: ExitCode.ToolOrConfigError,
      code: 'reflection.update'
    } satisfies Partial<CommanderError>);
  });

  it('refuses to overwrite a baseline path that is a symlink outside the baseline root', async () => {
    const root = await makeTempDir('reflection-update');
    const reportRoot = join(root, 'artifacts');
    const baselineRoot = join(root, 'baselines');
    await mkdir(join(reportRoot, 'runs'), { recursive: true });
    await writeRun(reportRoot, 'update-run');
    await mkdir(join(baselineRoot, 'browser/login'), { recursive: true });
    const outsideBaseline = join(root, 'outside-baseline.png');
    const baselinePath = join(baselineRoot, 'browser/login/mobile.png');
    await writeFile(outsideBaseline, 'OUTSIDE-BASELINE', 'utf8');
    await symlink(outsideBaseline, baselinePath);
    const configPath = await writeFixtureConfig(root, baselineRoot);

    await expect(updateCommand({ config: configPath, reportDir: reportRoot, fromRun: 'latest', route: 'login' })).rejects.toMatchObject({
      exitCode: ExitCode.ToolOrConfigError,
      code: 'reflection.update'
    } satisfies Partial<CommanderError>);
    await expect(readFile(outsideBaseline, 'utf8')).resolves.toBe('OUTSIDE-BASELINE');
  });

  it('refuses an intermediate baseline directory symlink without creating outside directories', async () => {
    const root = await makeTempDir('reflection-update');
    const reportRoot = join(root, 'artifacts');
    const baselineRoot = join(root, 'baselines');
    const outsideRoot = join(root, 'outside-baselines');
    await mkdir(join(reportRoot, 'runs'), { recursive: true });
    await writeRun(reportRoot, 'update-run');
    await mkdir(baselineRoot, { recursive: true });
    await mkdir(outsideRoot, { recursive: true });
    await symlink(outsideRoot, join(baselineRoot, 'browser'), 'dir');
    const configPath = await writeFixtureConfig(root, baselineRoot);

    await expect(updateCommand({ config: configPath, reportDir: reportRoot, fromRun: 'latest', route: 'login' })).rejects.toMatchObject({
      exitCode: ExitCode.ToolOrConfigError,
      code: 'reflection.update'
    } satisfies Partial<CommanderError>);
    await expect(stat(join(outsideRoot, 'login'))).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
