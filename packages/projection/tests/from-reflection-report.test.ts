import { describe, expect, it } from 'vitest';
import { projectFromReflectionReport, summarizeProjection, type ReflectionCheckLike, type ReflectionReportLike } from '../src/index.js';

const sha = (character: string): string => character.repeat(64);

function visualCheck(overrides: Partial<ReflectionCheckLike> = {}): ReflectionCheckLike {
  return {
    id: 'visual.button',
    suite: 'visual',
    status: 'pass',
    severity: 'review',
    artifacts: [
      { role: 'expected', path: 'visual/button/expected.png', sha256: sha('a') },
      { role: 'actual', path: 'visual/button/actual.png', sha256: sha('b') },
      { role: 'diff', path: 'visual/button/diff.png', sha256: sha('c') }
    ],
    metadata: { ref: 'requirement-17', componentSource: 'portal', path: '/reflection/button', viewport: 'button-default', diffPixels: 0, diffRatio: 0, capturePolicy: { hash: sha('d') } },
    ...overrides
  };
}

function report(checks: ReflectionCheckLike[]): ReflectionReportLike {
  return {
    runId: 'run-1',
    project: 'native-fixture',
    startedAt: '2026-10-18T10:00:00.000Z',
    finishedAt: '2026-10-18T10:00:30.000Z',
    environment: { reflectionVersion: '0.6.0', browser: { name: 'chromium', version: '148' } },
    checks,
    resultHash: { verdict: sha('e'), measured: sha('f') }
  };
}

describe('projectFromReflectionReport', () => {
  it('uses the case ref as the requirement id and joins the comparison to it exactly', () => {
    const projection = projectFromReflectionReport(report([visualCheck()]));

    expect(projection.requirements[0]?.id).toBe('requirement-17');
    expect(projection.comparisons[0]?.requirementId).toBe('requirement-17');
    expect(projection.comparisons[0]?.id).toBe('visual.button');
  });

  it('falls back to the check id when a case has no ref', () => {
    const projection = projectFromReflectionReport(report([visualCheck({ metadata: { diffPixels: 0, diffRatio: 0 } })]));

    expect(projection.requirements[0]?.id).toBe('visual.button');
  });

  it('assigns artifact roles explicitly and carries hashes, the capture policy hash and the diff measurement', () => {
    const comparison = projectFromReflectionReport(report([visualCheck()])).comparisons[0];

    expect(comparison?.reference?.artifact).toMatchObject({ role: 'reference', path: 'visual/button/expected.png', sha256: sha('a') });
    expect(comparison?.actual).toMatchObject({ role: 'actual', sha256: sha('b') });
    expect(comparison?.diff?.artifact).toMatchObject({ role: 'diff', sha256: sha('c') });
    expect(comparison?.diff?.metric).toMatchObject({ name: 'diff-pixels', value: 0, diffPixels: 0 });
    expect(comparison?.capturePolicyHash).toBe(sha('d'));
  });

  it('records a reference as not approved, because the engine has no approval concept', () => {
    expect(projectFromReflectionReport(report([visualCheck()])).comparisons[0]?.reference?.approval).toEqual({ state: 'none' });
  });

  it('maps outcomes so that a pixel diff over the threshold fails the proof and an error never passes', () => {
    const projection = projectFromReflectionReport(
      report([
        visualCheck({ id: 'visual.pass', metadata: {} }),
        visualCheck({ id: 'visual.warn', status: 'warn', metadata: {} }),
        visualCheck({ id: 'visual.fail', status: 'fail', severity: 'blocking', failureClass: 'visual-diff', metadata: {} }),
        visualCheck({ id: 'visual.error', status: 'error', metadata: {} }),
        visualCheck({ id: 'visual.skipped', status: 'skipped', metadata: {} })
      ])
    );

    expect(Object.fromEntries(projection.comparisons.map((comparison) => [comparison.id, comparison.proof.visual]))).toEqual({
      'visual.pass': 'passed',
      'visual.warn': 'failed',
      'visual.fail': 'failed',
      'visual.error': 'not-run',
      'visual.skipped': 'not-run'
    });
    expect(projection.comparisons.find((comparison) => comparison.id === 'visual.fail')?.verdict).toEqual({ status: 'fail', severity: 'blocking', failureClass: 'visual-diff' });
    expect(summarizeProjection(projection)).toMatchObject({ required: 5, proven: 1, failing: 2, unknown: 2 });
  });

  it('keeps a missing baseline as an unproven requirement with no reference', () => {
    const projection = projectFromReflectionReport(
      report([visualCheck({ status: 'warn', artifacts: [{ role: 'actual', path: 'visual/button/actual.png' }], metadata: { classification: 'missing-baseline' } })])
    );

    expect(projection.comparisons[0]?.reference).toBeUndefined();
    expect(projection.comparisons[0]?.proof.visual).toBe('failed');
  });

  it('leaves out checks that are not visual comparisons, and carries the run identity and hashes', () => {
    const projection = projectFromReflectionReport(report([visualCheck(), { ...visualCheck({ id: 'browser.login' }), suite: 'browser' }]));

    expect(projection.requirements).toHaveLength(1);
    expect(projection.runs[0]).toMatchObject({ id: 'run-1', engine: { name: 'reflection-check', version: '0.6.0' }, verdictHash: sha('e'), measuredHash: sha('f') });
  });

  it('refuses an artifact path that is not relative', () => {
    expect(() => projectFromReflectionReport(report([visualCheck({ artifacts: [{ role: 'actual', path: '/Users/someone/actual.png' }] })]))).toThrow('relative');
  });
});
