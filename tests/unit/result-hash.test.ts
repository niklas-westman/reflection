import { describe, expect, it } from 'vitest';
import { computeResultHash } from '../../src/core/result-hash.js';
import type { CheckResult } from '../../src/core/report-schema.js';

function check(overrides: Partial<CheckResult> = {}): CheckResult {
  return {
    id: 'visual.button',
    suite: 'visual',
    target: 'button component',
    status: 'pass',
    severity: 'review',
    summary: 'Button matches.',
    artifacts: [{ type: 'screenshot', role: 'actual', path: 'visual/button/actual.png', sha256: 'a'.repeat(64) }],
    metadata: { diffPixels: 0, diffRatio: 0, diffPath: '/runs/one/visual/button/diff.png', portalUrl: 'http://127.0.0.1:5001/x' },
    ...overrides
  };
}

describe('computeResultHash', () => {
  it('gives equal hashes for the same checks in any order', () => {
    const first = [check({ id: 'visual.a' }), check({ id: 'visual.b' })];
    const second = [check({ id: 'visual.b' }), check({ id: 'visual.a' })];

    expect(computeResultHash(first)).toEqual(computeResultHash(second));
  });

  it('ignores volatile paths, urls, summaries and timestamps in the verdict and measured hashes', () => {
    const before = computeResultHash([check()]);
    const after = computeResultHash([
      check({
        summary: 'Different wording.',
        metadata: { diffPixels: 0, diffRatio: 0, diffPath: '/runs/two/visual/button/diff.png', portalUrl: 'http://127.0.0.1:6002/x' }
      })
    ]);

    expect(after).toEqual(before);
  });

  it('changes the verdict when a status, severity or failure class changes', () => {
    const base = computeResultHash([check()]).verdict;

    expect(computeResultHash([check({ status: 'warn' })]).verdict).not.toBe(base);
    expect(computeResultHash([check({ severity: 'blocking' })]).verdict).not.toBe(base);
    expect(computeResultHash([check({ status: 'fail', failureClass: 'visual-diff' })]).verdict).not.toBe(base);
  });

  it('keeps the verdict stable when only measurements change, but changes the measured hash', () => {
    const before = computeResultHash([check()]);
    const after = computeResultHash([check({ metadata: { diffPixels: 2, diffRatio: 0.0001 } })]);

    expect(after.verdict).toBe(before.verdict);
    expect(after.measured).not.toBe(before.measured);
  });

  it('changes the measured hash when an artifact hash or the capture policy hash changes', () => {
    const base = computeResultHash([check()]).measured;
    const otherArtifact = check({ artifacts: [{ type: 'screenshot', role: 'actual', path: 'visual/button/actual.png', sha256: 'b'.repeat(64) }] });
    const otherPolicy = check({ metadata: { diffPixels: 0, diffRatio: 0, capturePolicy: { hash: 'c'.repeat(64) } } });

    expect(computeResultHash([otherArtifact]).measured).not.toBe(base);
    expect(computeResultHash([otherPolicy]).measured).not.toBe(base);
  });

  it('adds or removes a check from the verdict', () => {
    const one = computeResultHash([check({ id: 'visual.a' })]).verdict;
    const two = computeResultHash([check({ id: 'visual.a' }), check({ id: 'visual.b' })]).verdict;

    expect(two).not.toBe(one);
  });
});
