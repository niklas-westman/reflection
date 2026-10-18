import { describe, expect, it } from 'vitest';
import {
  archiveSummarySchema,
  buildArchiveSummary,
  buildDecisionBinding,
  countNotes,
  evaluateDecision,
  foldNotes,
  noteEventSchema,
  toArchivedDecision,
  type Decision,
  type NoteEvent
} from '../src/index.js';
import { makeProjection, release } from './helpers/bundle-builders.js';

const added = (id: string, at: string, overrides: Partial<Extract<NoteEvent, { type: 'note-added' }>> = {}): NoteEvent => ({
  type: 'note-added',
  id,
  by: 'designer@example.com',
  at,
  release: '2.4.0',
  family: 'button',
  bundleId: 'build-1',
  text: 'The hover state looks wrong',
  ...overrides
});

describe('notes', () => {
  it('requires a family and some text', () => {
    expect(noteEventSchema.safeParse({ ...added('n1', '2026-10-18T10:00:00.000Z'), family: undefined }).success).toBe(false);
    expect(noteEventSchema.safeParse({ ...added('n1', '2026-10-18T10:00:00.000Z'), text: '' }).success).toBe(false);
  });

  it('anchors to an item and an implementation only when given', () => {
    const [note] = foldNotes([added('n1', '2026-10-18T10:00:00.000Z', { requirementId: 'button/primary', implementation: 'react' }), added('n2', '2026-10-18T10:01:00.000Z')]);
    const [, family] = foldNotes([added('n1', '2026-10-18T10:00:00.000Z'), added('n2', '2026-10-18T10:01:00.000Z')]);

    expect(note).toMatchObject({ requirementId: 'button/primary', implementation: 'react', status: 'open' });
    expect(family).not.toHaveProperty('requirementId');
  });

  it('resolves and retracts without editing', () => {
    const notes = foldNotes([
      added('n1', '2026-10-18T10:00:00.000Z'),
      added('n2', '2026-10-18T10:01:00.000Z'),
      added('n3', '2026-10-18T10:02:00.000Z'),
      { type: 'note-resolved', id: 'e1', target: 'n1', by: 'dev@example.com', at: '2026-10-18T11:00:00.000Z' },
      { type: 'note-retracted', id: 'e2', target: 'n2', by: 'designer@example.com', at: '2026-10-18T11:01:00.000Z' }
    ]);

    expect(notes.map((note) => [note.id, note.status])).toEqual([['n1', 'resolved'], ['n2', 'retracted'], ['n3', 'open']]);
    expect(notes[0]).toMatchObject({ text: 'The hover state looks wrong', closedBy: 'dev@example.com' });
    expect(countNotes(notes)).toEqual({ open: 1, resolved: 1 });
  });

  it('applies events in time order whatever order they arrive in', () => {
    const notes = foldNotes([
      { type: 'note-resolved', id: 'e1', target: 'n1', by: 'dev@example.com', at: '2026-10-18T11:00:00.000Z' },
      added('n1', '2026-10-18T10:00:00.000Z')
    ]);

    expect(notes[0]?.status).toBe('resolved');
  });

  it('ignores an unknown target, a repeated id and a second resolution; a retraction is final', () => {
    const notes = foldNotes([
      added('n1', '2026-10-18T10:00:00.000Z'),
      added('n1', '2026-10-18T10:00:30.000Z', { text: 'a different text under the same id' }),
      { type: 'note-resolved', id: 'e0', target: 'nobody', by: 'dev@example.com', at: '2026-10-18T10:30:00.000Z' },
      { type: 'note-retracted', id: 'e1', target: 'n1', by: 'designer@example.com', at: '2026-10-18T11:00:00.000Z' },
      { type: 'note-resolved', id: 'e2', target: 'n1', by: 'dev@example.com', at: '2026-10-18T12:00:00.000Z' }
    ]);

    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ status: 'retracted', text: 'The hover state looks wrong', closedBy: 'designer@example.com' });
  });
});

describe('archive summary', () => {
  const decision: Decision = {
    id: 'd1',
    kind: 'approve',
    bundleId: release.bundleId,
    by: 'designer@example.com',
    at: '2026-10-18T12:00:00.000Z',
    attestation: 'human',
    binding: buildDecisionBinding(makeProjection().requirements, makeProjection().comparisons),
    acknowledged: { stillFailing: 1 }
  };

  const options = () => ({
    projection: { ...makeProjection(), release },
    bundleHash: 'd'.repeat(64),
    finalState: 'released' as const,
    decision: toArchivedDecision(decision, evaluateDecision(decision, decision.binding!, release.bundleId)),
    notes: countNotes([]),
    removed: { at: '2026-11-01T00:00:00.000Z', reason: 'left the previous-release slot' }
  });

  it('is built from the same counts every view uses, with a plain sentence', () => {
    const summary = buildArchiveSummary(options());

    expect(summary.coverage).toMatchObject({ required: 1, proven: 0, failing: 1 });
    expect(summary.decision).toMatchObject({ kind: 'approve', by: 'designer@example.com', standing: 'holds', acknowledged: { stillFailing: 1 } });
    expect(summary.summary).toBe('2.4.0 build 1: 0 of 1 required proven, 1 failing. Approved by designer@example.com.');
    expect(summary.snapshots).toEqual([expect.objectContaining({ id: 'figma-sync', capturedAt: '2026-10-14T08:00:00.000Z' })]);
    expect(summary.change).toBeNull();
    expect(archiveSummarySchema.safeParse(summary).success).toBe(true);
  });

  it('records no decision as no decision', () => {
    const summary = buildArchiveSummary({ ...options(), decision: null });

    expect(summary.decision).toBeNull();
    expect(summary.summary).toContain('No decision was recorded.');
  });

  it('keeps null readiness buckets null', () => {
    const projection = makeProjection();
    projection.provider.readinessConcepts = { needsDesign: false, notEnrolled: false };

    const summary = buildArchiveSummary({ ...options(), projection: { ...projection, release } });

    expect(summary.coverage.needsDesign).toBeNull();
    expect(summary.coverage.notEnrolled).toBeNull();
  });

  it('requires a superseded release to say what superseded it', () => {
    expect(() => buildArchiveSummary({ ...options(), finalState: 'superseded' })).toThrow(/superseded/);
    expect(buildArchiveSummary({ ...options(), finalState: 'superseded', supersededBy: '2.5.0' }).supersededBy).toBe('2.5.0');
  });

  it('does not archive a withdrawal or a reference approval as a verdict', () => {
    expect(toArchivedDecision({ ...decision, kind: 'accept-reference' }, { state: 'holds' })).toBeNull();
  });

  it('refuses a projection that has no release', () => {
    expect(() => buildArchiveSummary({ ...options(), projection: makeProjection() })).toThrow(/needs a projection with a release/);
  });

  it('summarizes a change from the predecessor when the delta has one', () => {
    const projection = { ...makeProjection(), release: { ...release, previousRelease: '2.3.0' } };
    projection.delta = {
      against: '2.3.0',
      sameSnapshot: true,
      regressed: [{ comparisonId: 'a' }],
      fixed: [],
      stillFailing: [],
      newlyEnrolled: [],
      newInDesign: [],
      stillProposed: [],
      removedInDesign: [],
      coverage: { before: null, after: { required: 1, proven: 0, failing: 1, needsDesign: null, notEnrolled: null, unknown: 0 } }
    } as typeof projection.delta;

    expect(buildArchiveSummary({ ...options(), projection }).change).toMatchObject({ against: '2.3.0', sameSnapshot: true, regressed: 1, fixed: 0 });
  });
});
