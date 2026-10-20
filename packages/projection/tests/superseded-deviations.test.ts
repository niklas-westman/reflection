import { describe, expect, it } from 'vitest';
import { bindingForComparisons, projectionSchema, standingDeviations, summarizeProjection, supersededComparisonIds, type Projection } from '../src/index.js';
import { readFixture } from './helpers/builders.js';

const docsSite = (): Projection => projectionSchema.parse(structuredClone(readFixture('independent-docs-site.json')));

describe('evidence from a superseded design source', () => {
  it('is left out of the counts, so nothing it proved reads as proven or failing', () => {
    const projection = docsSite();
    const before = summarizeProjection(projection);
    const old = { ...projection.snapshots[0]!, id: 'old-export', capturedAt: '2026-06-12T08:00:00Z', supersededBy: projection.snapshots[0]!.id };
    for (const comparison of projection.comparisons) comparison.snapshotId = 'old-export';
    const changed = projectionSchema.parse({ ...projection, snapshots: [...projection.snapshots, old] });

    expect(supersededComparisonIds(changed).size).toBe(changed.comparisons.length);
    expect(summarizeProjection(changed)).toEqual({ ...before, proven: 0, failing: 0, unknown: before.unknown + before.proven + before.failing });
  });

  it('only touches the comparisons that read the superseded snapshot', () => {
    const projection = docsSite();
    expect(supersededComparisonIds(projection).size).toBe(0);
    expect(summarizeProjection(projectionSchema.parse({ ...projection, snapshots: [...projection.snapshots, { ...projection.snapshots[0]!, id: 'unused-old', supersededBy: projection.snapshots[0]!.id }] }))).toEqual(summarizeProjection(projection));
  });

  it('must name a snapshot that exists, and not itself', () => {
    const projection = docsSite();
    const first = projection.snapshots[0]!;
    expect(projectionSchema.safeParse({ ...projection, snapshots: [{ ...first, supersededBy: 'nope' }] }).success).toBe(false);
    expect(projectionSchema.safeParse({ ...projection, snapshots: [{ ...first, supersededBy: first.id }] }).success).toBe(false);
  });
});

describe('deviations the owner accepted', () => {
  const accept = (projection: Projection, comparisonIds: string[], extra: Record<string, unknown> = {}): Projection =>
    projectionSchema.parse({
      ...projection,
      decisions: [
        {
          id: 'raised-limit',
          kind: 'accept-deviation',
          bundleId: 'bundle-1',
          by: 'Owner',
          recordedBy: 'Assistant',
          at: '2026-10-16T10:00:00Z',
          attestation: 'delegated',
          comment: 'Label-only text differences are fine up to 110 px.',
          scope: { comparisonIds },
          binding: bindingForComparisons(projection, comparisonIds),
          ...extra
        }
      ]
    });

  it('holds while the accepted comparisons are unchanged, and never changes their outcome', () => {
    const projection = docsSite();
    const ids = projection.comparisons.slice(0, 2).map((comparison) => comparison.id);
    const accepted = accept(projection, ids);

    expect(standingDeviations(accepted, 'bundle-1')).toEqual([expect.objectContaining({ comparisonIds: ids, standing: { state: 'holds' } })]);
    expect(standingDeviations(accepted, 'bundle-2')[0]!.standing).toEqual({ state: 'carried-forward', from: 'bundle-1' });
    expect(summarizeProjection(accepted)).toEqual(summarizeProjection(projection));
  });

  it('lapses when a verdict it was bound to changes', () => {
    const projection = docsSite();
    const id = projection.comparisons[0]!.id;
    const accepted = accept(projection, [id]);
    accepted.comparisons[0]!.verdict = { status: 'fail', severity: 'blocking', failureClass: 'visual-mismatch' };

    expect(standingDeviations(accepted, 'bundle-1')[0]!.standing).toMatchObject({ state: 'lapsed', causes: [{ kind: 'verdict', id }] });
  });

  it('leaves out a withdrawn deviation and one with no comparisons in scope', () => {
    const projection = docsSite();
    const id = projection.comparisons[0]!.id;
    const accepted = accept(projection, [id]);
    const withdrawn = projectionSchema.parse({ ...accepted, decisions: [...accepted.decisions, { id: 'w', kind: 'withdrawn', bundleId: 'bundle-1', by: 'Owner', at: '2026-10-17T10:00:00Z', attestation: 'human', target: 'raised-limit' }] });
    expect(standingDeviations(withdrawn, 'bundle-1')).toEqual([]);
    expect(standingDeviations(accept(projection, [], { scope: {} }), 'bundle-1')).toEqual([]);
  });
});
