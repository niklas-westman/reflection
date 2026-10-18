import { z } from 'zod';
import { acknowledgedCountsSchema, type Decision, type DecisionState } from './decision.js';
import type { NoteCounts } from './note.js';
import { idSchema, sha256Schema, timestampSchema } from './primitives.js';
import { summarizeProjection, type Projection } from './projection.js';
import { coverageSummarySchema } from './requirement.js';
import { sourceSnapshotSchema } from './snapshot.js';

// The decision as it stood when the release left its slot.
export const archivedDecisionSchema = z.object({
  kind: z.enum(['approve', 'changes-required']),
  by: z.string().min(1),
  at: timestampSchema,
  message: z.string().min(1).optional(),
  acknowledged: acknowledgedCountsSchema.optional(),
  standing: z.enum(['holds', 'carried-forward', 'lapsed', 'withdrawn'])
});
export type ArchivedDecision = z.output<typeof archivedDecisionSchema>;

const archivedSnapshotSchema = sourceSnapshotSchema.pick({ id: true, kind: true, role: true, label: true, capturedAt: true, upstreamModifiedAt: true, version: true });

/**
 * What stays after a release's images are gone: counts, the decision, the snapshot dates and the notes at
 * exit. A few KB, written before anything is deleted, never edited, never presented as evidence.
 */
export const archiveSummarySchema = z
  .object({
    schemaVersion: z.literal(1),
    project: idSchema,
    release: z.string().min(1),
    build: z.number().int().positive(),
    // Which bundle this summarizes, so a decision record that names a bundle can still be matched to it.
    bundleHash: sha256Schema,
    finalState: z.enum(['released', 'superseded']),
    supersededBy: z.string().min(1).optional(),
    commit: z.string().min(1).optional(),
    decision: archivedDecisionSchema.nullable(),
    snapshots: z.array(archivedSnapshotSchema),
    // Counted by the same function every view uses. null buckets stay null.
    coverage: coverageSummarySchema,
    // Change from the predecessor, or null for a first release.
    change: z
      .object({
        against: z.string().min(1),
        sameSnapshot: z.boolean(),
        regressed: z.number().int().nonnegative(),
        fixed: z.number().int().nonnegative(),
        stillFailing: z.number().int().nonnegative(),
        newInDesign: z.number().int().nonnegative(),
        removedInDesign: z.number().int().nonnegative(),
        newlyEnrolled: z.number().int().nonnegative()
      })
      .nullable(),
    notes: z.object({ open: z.number().int().nonnegative(), resolved: z.number().int().nonnegative() }),
    summary: z.string().min(1).max(400),
    removed: z.object({ at: timestampSchema, reason: z.string().min(1) })
  })
  .superRefine((summary, context) => {
    if (summary.finalState === 'superseded' && !summary.supersededBy) {
      context.addIssue({ code: 'custom', path: ['supersededBy'], message: 'a superseded release must say what superseded it' });
    }
  });
export type ArchiveSummary = z.output<typeof archiveSummarySchema>;

export interface BuildArchiveSummaryOptions {
  projection: Projection;
  bundleHash: string;
  finalState: ArchiveSummary['finalState'];
  supersededBy?: string;
  decision: ArchivedDecision | null;
  notes: NoteCounts;
  removed: ArchiveSummary['removed'];
  // Defaults to a sentence built from the counts.
  summary?: string;
}

/** A decision as it is archived, or null for kinds that are not a verdict on the release (a withdrawal, a reference approval). */
export function toArchivedDecision(decision: Decision, state: DecisionState): ArchivedDecision | null {
  if (decision.kind !== 'approve' && decision.kind !== 'changes-required') {
    return null;
  }
  return {
    kind: decision.kind,
    by: decision.by,
    at: decision.at,
    ...(decision.message ? { message: decision.message } : {}),
    ...(decision.acknowledged ? { acknowledged: decision.acknowledged } : {}),
    standing: state.state
  };
}

export function buildArchiveSummary(options: BuildArchiveSummaryOptions): ArchiveSummary {
  const { projection } = options;
  const release = projection.release;
  if (!release) {
    throw new Error('an archive summary needs a projection with a release; open the bundle to fill it in');
  }

  const coverage = summarizeProjection(projection);
  const delta = projection.delta;
  return archiveSummarySchema.parse({
    schemaVersion: 1,
    project: projection.project.id,
    release: release.release,
    build: release.build,
    bundleHash: options.bundleHash,
    finalState: options.finalState,
    ...(options.supersededBy ? { supersededBy: options.supersededBy } : {}),
    ...(release.commit ? { commit: release.commit } : {}),
    decision: options.decision,
    snapshots: projection.snapshots.filter((snapshot) => release.snapshotIds.includes(snapshot.id)).map((snapshot) => archivedSnapshotSchema.parse(snapshot)),
    coverage,
    change:
      delta && delta.against !== null
        ? {
            against: delta.against,
            sameSnapshot: delta.sameSnapshot,
            regressed: delta.regressed.length,
            fixed: delta.fixed.length,
            stillFailing: delta.stillFailing.length,
            newInDesign: delta.newInDesign.length,
            removedInDesign: delta.removedInDesign.length,
            newlyEnrolled: delta.newlyEnrolled.length
          }
        : null,
    notes: options.notes,
    summary: options.summary ?? describeRelease(release.release, release.build, coverage, options.decision),
    removed: options.removed
  });
}

function describeRelease(release: string, build: number, coverage: ArchiveSummary['coverage'], decision: ArchivedDecision | null): string {
  const outcome = decision ? (decision.kind === 'approve' ? `Approved by ${decision.by}.` : `Changes required by ${decision.by}.`) : 'No decision was recorded.';
  return `${release} build ${build}: ${coverage.proven} of ${coverage.required} required proven, ${coverage.failing} failing. ${outcome}`;
}
