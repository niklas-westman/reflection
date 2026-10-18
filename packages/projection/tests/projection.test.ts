import { describe, expect, it } from 'vitest';
import { artifactSchema, deltaSchema, projectionSchema, referenceApprovalSchema, releaseManifestSchema } from '../src/index.js';
import { readFixture } from './helpers/builders.js';

function independent(): Record<string, unknown> {
  return structuredClone(readFixture('independent-docs-site.json')) as Record<string, unknown>;
}

describe('projection integrity', () => {
  it('rejects duplicate ids in a collection', () => {
    const projection = independent();
    const requirements = projection.requirements as Array<Record<string, unknown>>;
    requirements.push({ ...requirements[0] });

    expect(() => projectionSchema.parse(projection)).toThrow('duplicate id');
  });

  it('rejects a comparison that points at an unknown requirement, run or snapshot', () => {
    const projection = independent();
    const comparisons = projection.comparisons as Array<Record<string, unknown>>;
    comparisons[0] = { ...comparisons[0], requirementId: 'nope', runId: 'nope', snapshotId: 'nope' };

    expect(() => projectionSchema.parse(projection)).toThrow(/unknown requirement[\s\S]*unknown run[\s\S]*unknown snapshot/);
  });

  it('rejects a withdrawal that targets an unknown decision', () => {
    const projection = independent();
    projection.decisions = [{ id: 'w', kind: 'withdrawn', bundleId: 'b', by: 'x@example.com', at: '2026-10-18T10:00:00Z', attestation: 'human', target: 'missing' }];

    expect(() => projectionSchema.parse(projection)).toThrow('unknown decision');
  });

  it('rejects an unsupported schema version', () => {
    expect(() => projectionSchema.parse({ ...independent(), schemaVersion: 2 })).toThrow();
  });
});

describe('artifact paths', () => {
  const base = { role: 'actual' as const };

  it('accepts a relative path and rejects absolute and traversing paths', () => {
    expect(artifactSchema.parse({ ...base, path: 'runs/a/shot.png' }).path).toBe('runs/a/shot.png');
    expect(() => artifactSchema.parse({ ...base, path: '/etc/passwd' })).toThrow('relative');
    expect(() => artifactSchema.parse({ ...base, path: 'C:\\Users\\x\\shot.png' })).toThrow('relative');
    expect(() => artifactSchema.parse({ ...base, path: '../../outside.png' })).toThrow('must not contain');
    expect(() => artifactSchema.parse({ ...base, path: 'a/../../b.png' })).toThrow('must not contain');
  });
});

describe('reference approval', () => {
  it('says whether a human or an agent recorded an approval that holds or lapsed', () => {
    expect(() => referenceApprovalSchema.parse({ state: 'holds' })).toThrow('human or an agent');
    expect(() => referenceApprovalSchema.parse({ state: 'lapsed' })).toThrow('human or an agent');
    expect(referenceApprovalSchema.parse({ state: 'none' }).state).toBe('none');
    expect(referenceApprovalSchema.parse({ state: 'holds', attestation: 'agent' }).attestation).toBe('agent');
  });
});

describe('release manifest and delta', () => {
  const summary = { required: 217, proven: 17, failing: 1, needsDesign: 1, notEnrolled: 198, unknown: 0 };

  it('accepts a candidate manifest that reuses the previous release snapshot', () => {
    const manifest = releaseManifestSchema.parse({
      release: '2.4.0',
      build: 2,
      bundleId: 'bundle-2',
      state: 'candidate',
      builtAt: '2026-10-14T16:40:00Z',
      branch: 'release/2.4.0',
      commit: 'a41f9c2',
      previousRelease: '2.3.0',
      snapshotIds: ['figma-2410234809276115335']
    });

    expect(manifest.build).toBe(2);
  });

  it('accepts a delta with new-in-design items, still-proposed items and an explicit same-snapshot flag', () => {
    const delta = deltaSchema.parse({
      against: '2.3.0',
      sameSnapshot: false,
      regressed: [{ comparisonId: 'c1' }],
      fixed: [],
      stillFailing: [{ comparisonId: 'c2', since: '2.2.0', releases: 3 }],
      newlyEnrolled: ['req-9'],
      newInDesign: [{ key: 'button/size-xs', label: 'Size XS', kind: 'size' }],
      stillProposed: [{ key: 'select/multi', label: 'Multi-select', kind: 'variant', status: 'accepted', since: '2.3.0' }],
      removedInDesign: [],
      coverage: { before: null, after: summary }
    });

    expect(delta.sameSnapshot).toBe(false);
  });

  it('rejects a delta whose coverage buckets do not add up', () => {
    expect(() =>
      deltaSchema.parse({
        against: null,
        sameSnapshot: false,
        regressed: [],
        fixed: [],
        stillFailing: [],
        newlyEnrolled: [],
        newInDesign: [],
        stillProposed: [],
        removedInDesign: [],
        coverage: { before: null, after: { ...summary, required: 5 } }
      })
    ).toThrow('sum of the readiness buckets');
  });
});
