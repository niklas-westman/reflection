import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { CommanderError } from 'commander';
import { describe, expect, it, vi } from 'vitest';
import { reviewCommand } from '../../src/commands/review.js';
import { createReport, type CheckResult } from '../../src/core/report-schema.js';
import { ExitCode } from '../../src/core/exit-codes.js';

async function makeReportRoot() {
  const root = join(tmpdir(), `reflection-review-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  await mkdir(root, { recursive: true });
  return root;
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

async function writeRun(root: string, runId: string) {
  const runDir = join(root, 'runs', runId);
  await mkdir(runDir, { recursive: true });
  const report = createReport({
    runId,
    project: 'review-fixture',
    startedAt: new Date('2026-05-31T12:00:00.000Z'),
    finishedAt: new Date('2026-05-31T12:00:01.000Z'),
    mode: 'smoke',
    ci: false,
    checks: [
      check({ id: 'browser.login.mobile', status: 'pass', severity: 'blocking', artifacts: [{ type: 'screenshot', role: 'actual', path: 'browser/login/mobile/actual.png' }] }),
      check({ id: 'visual.login-mobile', suite: 'visual', status: 'warn', severity: 'review', summary: 'Login mobile visual changed.', artifacts: [{ type: 'visual-diff', role: 'diff', path: 'visual/login-mobile/diff.png' }] }),
      check({ id: 'browser.admin.mobile', status: 'fail', severity: 'blocking', summary: 'Admin route leaked private UI.' })
    ],
    suggestedNextSteps: [{ kind: 'fix', summary: 'Fix the admin auth gate before updating baselines.' }]
  });
  await writeFile(join(runDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await mkdir(join(root, 'runs'), { recursive: true });
  await writeFile(join(root, 'runs', 'latest'), `${runId}\n`, 'utf8');
  return report;
}

async function captureReview(options: Parameters<typeof reviewCommand>[0]) {
  let stdout = '';
  const originalLog = console.log;
  vi.spyOn(console, 'log').mockImplementation((...values: unknown[]) => {
    stdout += `${values.join(' ')}\n`;
  });

  try {
    await reviewCommand(options);
  } finally {
    console.log = originalLog;
  }

  return stdout;
}

describe('reviewCommand', () => {
  it('prints latest run status, blocking failures, review items, artifacts, and suggested next steps', async () => {
    const root = await makeReportRoot();
    await writeRun(root, '2026-05-31T12-00-00Z-local');

    const stdout = await captureReview({ reportDir: root, latest: true });

    expect(stdout).toContain('Reflection review');
    expect(stdout).toContain('Run: 2026-05-31T12-00-00Z-local');
    expect(stdout).toContain('Status: fail');
    expect(stdout).toContain('Blocking:');
    expect(stdout).toContain('browser.admin.mobile — Admin route leaked private UI.');
    expect(stdout).toContain('Review:');
    expect(stdout).toContain('visual.login-mobile — Login mobile visual changed.');
    expect(stdout).toContain('Artifacts:');
    expect(stdout).toContain('visual/login-mobile/diff.png');
    expect(stdout).toContain('Next:');
    expect(stdout).toContain('Fix the admin auth gate before updating baselines.');
  });

  it('prints a stable JSON summary for agents', async () => {
    const root = await makeReportRoot();
    await writeRun(root, 'agent-run');

    const stdout = await captureReview({ reportDir: root, run: 'agent-run', json: true });
    const parsed = JSON.parse(stdout) as {
      status: string;
      blockingFailures: Array<{ id: string }>;
      reviewItems: Array<{ id: string }>;
      artifactPaths: string[];
      reportPath: string;
    };

    expect(parsed.status).toBe('fail');
    expect(parsed.blockingFailures.map((item) => item.id)).toEqual(['browser.admin.mobile']);
    expect(parsed.reviewItems.map((item) => item.id)).toEqual(['visual.login-mobile']);
    expect(parsed.artifactPaths).toContain('visual/login-mobile/diff.png');
    expect(parsed.reportPath).toMatch(/agent-run\/report\.json$/);
  });

  it('returns a tool error when the latest run pointer is missing', async () => {
    const root = await makeReportRoot();

    await expect(reviewCommand({ reportDir: root })).rejects.toMatchObject({
      exitCode: ExitCode.ToolOrConfigError,
      code: 'reflection.review'
    } satisfies Partial<CommanderError>);
  });

  it('rejects ambiguous latest and run options', async () => {
    const root = await makeReportRoot();
    await writeRun(root, 'explicit-run');

    await expect(reviewCommand({ reportDir: root, latest: true, run: 'explicit-run' })).rejects.toMatchObject({
      exitCode: ExitCode.ToolOrConfigError,
      code: 'reflection.review'
    } satisfies Partial<CommanderError>);
  });

  it('rejects unsafe run ids from the latest pointer', async () => {
    const root = await makeReportRoot();
    await mkdir(join(root, 'runs'), { recursive: true });
    await writeFile(join(root, 'runs', 'latest'), '../outside\n', 'utf8');

    await expect(reviewCommand({ reportDir: root })).rejects.toMatchObject({
      exitCode: ExitCode.ToolOrConfigError,
      code: 'reflection.review'
    } satisfies Partial<CommanderError>);
  });
});
