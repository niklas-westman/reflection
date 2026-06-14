import { describe, expect, it } from 'vitest';
import {
  createReport,
  deriveSuggestedNextSteps,
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

describe('deriveSuggestedNextSteps', () => {
  it('suggests fixing named blocking checks before visual updates', () => {
    const steps = deriveSuggestedNextSteps([
      check({ id: 'browser.admin.mobile', status: 'fail', severity: 'blocking', summary: 'Admin route leaked private UI.' }),
      check({ id: 'visual.login-mobile', suite: 'visual', status: 'warn', severity: 'review', summary: 'Login visual changed.' })
    ]);

    expect(steps).toEqual([
      {
        kind: 'fix',
        summary: 'Fix blocking checks before updating baselines: browser.admin.mobile.'
      }
    ]);
  });

  it('suggests dry-run update for review-only visual diffs', () => {
    const steps = deriveSuggestedNextSteps([
      check({ status: 'pass', severity: 'blocking' }),
      check({ id: 'visual.login-mobile', suite: 'visual', status: 'warn', severity: 'review', summary: 'Login visual changed.' })
    ]);

    expect(steps).toEqual([
      {
        kind: 'review',
        summary: 'Inspect review-only visual artifacts, then run `reflection update --dry-run --case <caseId> --from-run latest` for intentional route visual changes.'
      }
    ]);
  });

  it('suggests baseline creation when visual checks are missing approved baselines', () => {
    const steps = deriveSuggestedNextSteps([
      check({
        id: 'visual.login-mobile',
        suite: 'visual',
        status: 'warn',
        severity: 'review',
        summary: 'Missing approved visual baseline.',
        metadata: { classification: 'missing-baseline' }
      })
    ]);

    expect(steps[0]?.summary).toContain('Review actual screenshots for missing baselines');
  });

  it('suggests no action when all checks pass', () => {
    expect(deriveSuggestedNextSteps([check({ status: 'pass', severity: 'blocking' })])).toEqual([
      { kind: 'pass', summary: 'No action required; expand route or visual coverage when useful.' }
    ]);
  });

  it('uses derived suggestions by default when creating reports', () => {
    const report = createReport({
      runId: 'derived-steps',
      project: 'report-fixture',
      startedAt: new Date('2026-05-31T12:00:00.000Z'),
      finishedAt: new Date('2026-05-31T12:00:01.000Z'),
      mode: 'smoke',
      ci: false,
      checks: [check({ status: 'pass', severity: 'blocking' })]
    });

    expect(report.suggestedNextSteps).toEqual([
      { kind: 'pass', summary: 'No action required; expand route or visual coverage when useful.' }
    ]);
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

  it('accepts classified diagnostics and structured evidence on checks', () => {
    const report = createReport({
      runId: 'diagnostic-report',
      project: 'report-fixture',
      startedAt: new Date('2026-05-31T12:00:00.000Z'),
      finishedAt: new Date('2026-05-31T12:00:01.000Z'),
      mode: 'visual',
      ci: false,
      checks: [
        check({
          id: 'visual.button',
          suite: 'visual',
          status: 'fail',
          severity: 'blocking',
          summary: 'Button differs.',
          failureClass: 'token-mismatch',
          confidence: 0.75,
          diagnostics: [
            {
              kind: 'visual-diff',
              message: 'Color drift detected.',
              severity: 'warning',
              evidence: [{ kind: 'runtime-probes', summary: '1 probed part' }]
            }
          ],
          evidence: [{ kind: 'visual-diff', data: { diffPixels: 12 } }],
          recommendations: ['Check theme mode and bound tokens.']
        })
      ]
    });

    expect(report.checks[0]).toMatchObject({
      failureClass: 'token-mismatch',
      confidence: 0.75,
      recommendations: ['Check theme mode and bound tokens.']
    });
  });
});
