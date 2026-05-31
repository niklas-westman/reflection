import { describe, expect, it } from 'vitest';
import {
  deriveExitCode,
  deriveReportStatus,
  summarizeChecks,
  validateReport,
  type CheckResult,
  type ReflectionReport
} from '../../src/core/report-schema.js';
import { ExitCode } from '../../src/core/exit-codes.js';

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

describe('report status derivation', () => {
  it('reports pass when all blocking checks pass', () => {
    const checks = [check({ status: 'pass', severity: 'blocking' })];

    expect(deriveReportStatus(checks)).toBe('pass');
    expect(deriveExitCode(deriveReportStatus(checks))).toBe(ExitCode.Success);
  });

  it('reports pass-with-review when only review warnings exist', () => {
    const checks = [check({ status: 'pass', severity: 'blocking' }), check({ status: 'warn', severity: 'review' })];

    expect(deriveReportStatus(checks)).toBe('pass-with-review');
    expect(deriveExitCode(deriveReportStatus(checks))).toBe(ExitCode.Success);
  });

  it('reports fail when a blocking check fails', () => {
    const checks = [check({ status: 'fail', severity: 'blocking' }), check({ status: 'warn', severity: 'review' })];

    expect(deriveReportStatus(checks)).toBe('fail');
    expect(deriveExitCode(deriveReportStatus(checks))).toBe(ExitCode.BlockingFailure);
  });

  it('reports error when a check errors', () => {
    const checks = [check({ status: 'error', severity: 'blocking' })];

    expect(deriveReportStatus(checks)).toBe('error');
    expect(deriveExitCode(deriveReportStatus(checks))).toBe(ExitCode.ToolOrConfigError);
  });

  it('summarizes check counts and blocking/review counts', () => {
    const summary = summarizeChecks([
      check({ status: 'pass', severity: 'blocking' }),
      check({ status: 'fail', severity: 'blocking' }),
      check({ status: 'warn', severity: 'review' }),
      check({ status: 'skipped', severity: 'info' })
    ]);

    expect(summary).toEqual({
      passed: 1,
      failed: 1,
      warnings: 1,
      skipped: 1,
      blockingFailures: 1,
      reviewItems: 1
    });
  });
});

describe('validateReport', () => {
  it('accepts a canonical Reflection report', () => {
    const report: ReflectionReport = {
      schemaVersion: 1,
      runId: '2026-05-31T18-00-00Z-local',
      project: 'reflection-test',
      startedAt: '2026-05-31T18:00:00.000Z',
      finishedAt: '2026-05-31T18:00:01.000Z',
      status: 'pass-with-review',
      mode: 'smoke',
      ci: false,
      environment: { profile: 'local' },
      summary: {
        passed: 1,
        failed: 0,
        warnings: 1,
        skipped: 0,
        blockingFailures: 0,
        reviewItems: 1
      },
      checks: [check({ status: 'pass' }), check({ status: 'warn', severity: 'review' })],
      artifacts: [{ type: 'report', role: 'evidence', path: 'report.json' }],
      suggestedNextSteps: [{ kind: 'review', summary: 'Inspect review items.' }]
    };

    expect(validateReport(report).status).toBe('pass-with-review');
  });
});
