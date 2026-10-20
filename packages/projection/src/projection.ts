import { z } from 'zod';
import { comparisonSchema } from './comparison.js';
import { buildDecisionBinding, decisionSchema, evaluateDecision, type Decision, type DecisionBinding, type DecisionState } from './decision.js';
import { runSchema } from './evidence.js';
import { idSchema, timestampSchema } from './primitives.js';
import { deltaSchema, releaseManifestSchema } from './release.js';
import { requirementSchema, summarizeReadiness, type CoverageSummary } from './requirement.js';
import { sourceSnapshotSchema } from './snapshot.js';
import { subjectInfoSchema } from './subject-catalog.js';

export const providerSchema = z.object({
  name: z.string().min(1),
  version: z.string().min(1).optional(),
  // Which readiness buckets this provider can speak about. A bucket it cannot is shown as unknown, never 0.
  readinessConcepts: z.object({ needsDesign: z.boolean(), notEnrolled: z.boolean() }),
  capabilities: z.array(z.string().min(1)).default([])
});

export const projectionSchema = z
  .object({
    schemaVersion: z.literal(1),
    project: z.object({ id: idSchema, name: z.string().min(1) }),
    provider: providerSchema,
    generatedAt: timestampSchema,
    // full: the provider declares every required item, so missing ones are visible.
    // executed-only: only what ran is listed (the engine cannot declare required items), so coverage is a lower bound.
    inventory: z.enum(['full', 'executed-only']),
    scope: z.string().min(1).optional(),
    // Optional facts about subjects (label, description, link, change note). A subject needs no entry.
    subjects: z.array(subjectInfoSchema).default([]),
    snapshots: z.array(sourceSnapshotSchema).default([]),
    requirements: z.array(requirementSchema).default([]),
    comparisons: z.array(comparisonSchema).default([]),
    runs: z.array(runSchema).default([]),
    decisions: z.array(decisionSchema).default([]),
    release: releaseManifestSchema.optional(),
    delta: deltaSchema.optional(),
    // Provider-specific extras the UI does not interpret.
    meta: z.record(z.string(), z.unknown()).optional()
  })
  .superRefine((projection, context) => {
    const requirementIds = collectUniqueIds(projection.requirements, 'requirements', context);
    const runIds = collectUniqueIds(projection.runs, 'runs', context);
    const snapshotIds = collectUniqueIds(projection.snapshots, 'snapshots', context);
    const decisionIds = collectUniqueIds(projection.decisions, 'decisions', context);
    collectUniqueIds(projection.comparisons, 'comparisons', context);

    const subjectKeys = new Set<string>();
    projection.subjects.forEach((subject, index) => {
      const key = `${subject.kind}/${subject.id}`;
      if (subjectKeys.has(key)) {
        context.addIssue({ code: 'custom', path: ['subjects', index, 'id'], message: `duplicate subject "${key}"` });
      }
      subjectKeys.add(key);
    });

    projection.comparisons.forEach((comparison, index) => {
      requireKnown(comparison.requirementId, requirementIds, ['comparisons', index, 'requirementId'], 'requirement', context);
      requireKnown(comparison.runId, runIds, ['comparisons', index, 'runId'], 'run', context);
      requireKnown(comparison.snapshotId, snapshotIds, ['comparisons', index, 'snapshotId'], 'snapshot', context);
    });
    projection.requirements.forEach((requirement, index) => {
      requireKnown(requirement.design?.snapshotId, snapshotIds, ['requirements', index, 'design', 'snapshotId'], 'snapshot', context);
    });
    projection.snapshots.forEach((snapshot, index) => {
      requireKnown(snapshot.supersededBy, snapshotIds, ['snapshots', index, 'supersededBy'], 'snapshot', context);
      if (snapshot.supersededBy === snapshot.id) {
        context.addIssue({ code: 'custom', path: ['snapshots', index, 'supersededBy'], message: 'a snapshot cannot supersede itself' });
      }
    });
    projection.release?.snapshotIds.forEach((snapshotId, index) => {
      requireKnown(snapshotId, snapshotIds, ['release', 'snapshotIds', index], 'snapshot', context);
    });
    projection.decisions.forEach((decision, index) => {
      requireKnown(decision.target, decisionIds, ['decisions', index, 'target'], 'decision', context);
    });
  });
export type Projection = z.output<typeof projectionSchema>;

/**
 * Readiness counts for a projection, using the provider's own concepts. The only place views should count.
 * Comparisons that read a superseded design snapshot are left out, so their requirements read as not proven.
 */
export function summarizeProjection(projection: Projection): CoverageSummary {
  const superseded = supersededComparisonIds(projection);
  const counted = projection.comparisons.filter((comparison) => !superseded.has(comparison.id));
  return summarizeReadiness(projection.requirements, counted, projection.provider.readinessConcepts);
}

/** Comparisons whose design snapshot was superseded: they proved an old design and count as not proven. */
export function supersededComparisonIds(projection: Pick<Projection, 'snapshots' | 'comparisons'>): Set<string> {
  const superseded = new Set(projection.snapshots.filter((snapshot) => snapshot.supersededBy !== undefined).map((snapshot) => snapshot.id));
  return new Set(projection.comparisons.filter((comparison) => comparison.snapshotId !== undefined && superseded.has(comparison.snapshotId)).map((comparison) => comparison.id));
}

export interface StandingDeviation {
  decision: Decision;
  comparisonIds: string[];
  standing: DecisionState;
}

/**
 * The binding of a set of comparisons and their requirements. A provider that imports a decision scoped to
 * comparisons builds its binding with this, and a viewer evaluates it against the same scope.
 */
export function bindingForComparisons(projection: Pick<Projection, 'requirements' | 'comparisons'>, comparisonIds: string[]): DecisionBinding {
  const scope = new Set(comparisonIds);
  const comparisons = projection.comparisons.filter((comparison) => scope.has(comparison.id));
  const requirementIds = new Set(comparisons.flatMap((comparison) => (comparison.requirementId ? [comparison.requirementId] : [])));
  return buildDecisionBinding(projection.requirements.filter((requirement) => requirementIds.has(requirement.id)), comparisons);
}

/**
 * Deviations the owner accepted (raised limits, known differences), each with whether it still holds against the
 * evidence in this bundle. Only `accept-deviation` decisions scoped to comparisons, and not withdrawn, are listed.
 * They are review, never proof: a comparison's outcome does not change because of them.
 */
export function standingDeviations(projection: Projection, bundleId: string): StandingDeviation[] {
  const withdrawn = new Set(projection.decisions.filter((decision) => decision.kind === 'withdrawn' && decision.target).map((decision) => decision.target));
  return projection.decisions
    .filter((decision) => decision.kind === 'accept-deviation' && !withdrawn.has(decision.id) && (decision.scope?.comparisonIds?.length ?? 0) > 0)
    .map((decision) => {
      const comparisonIds = decision.scope?.comparisonIds ?? [];
      return { decision, comparisonIds, standing: evaluateDecision(decision, bindingForComparisons(projection, comparisonIds), bundleId) };
    });
}

function collectUniqueIds(items: Array<{ id: string }>, collection: string, context: z.RefinementCtx): Set<string> {
  const seen = new Set<string>();
  items.forEach((item, index) => {
    if (seen.has(item.id)) {
      context.addIssue({ code: 'custom', path: [collection, index, 'id'], message: `duplicate id "${item.id}" in ${collection}` });
    }
    seen.add(item.id);
  });
  return seen;
}

function requireKnown(id: string | undefined, known: Set<string>, path: Array<string | number>, noun: string, context: z.RefinementCtx): void {
  if (id !== undefined && !known.has(id)) {
    context.addIssue({ code: 'custom', path, message: `unknown ${noun} "${id}"` });
  }
}
