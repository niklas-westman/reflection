import { z } from 'zod';
import { addDelegationIssues, attestationSchema } from './attestation.js';
import type { Comparison, Verdict } from './comparison.js';
import { idSchema, sha256Schema, timestampSchema } from './primitives.js';
import type { Requirement } from './requirement.js';

export const decisionKindSchema = z.enum(['approve', 'changes-required', 'accept-reference', 'accept-deviation', 'accept-coverage-gap', 'withdrawn']);
export type DecisionKind = z.output<typeof decisionKindSchema>;

// What a decision was made about. It contains no run id, timestamp or path, so an identical rebuild produces
// the same binding and a decision can carry forward. Entries are readable on purpose, so a lapse can name
// exactly what changed.
export const decisionBindingSchema = z.object({
  // Comparison id to "status/severity/failure-class" as the engine reported it.
  verdicts: z.record(z.string(), z.string()),
  // Comparison id to the sha256 of the baseline file it was compared against.
  references: z.record(z.string(), sha256Schema),
  // Comparison id to the capture policy hash it was captured under.
  capturePolicies: z.record(z.string(), sha256Schema),
  // The required item ids, sorted.
  requirements: z.array(idSchema)
});
export type DecisionBinding = z.output<typeof decisionBindingSchema>;

export const acknowledgedCountsSchema = z.object({
  regressed: z.number().int().nonnegative().optional(),
  fixed: z.number().int().nonnegative().optional(),
  stillFailing: z.number().int().nonnegative().optional(),
  newInDesign: z.number().int().nonnegative().optional(),
  missing: z.number().int().nonnegative().optional(),
  openNotes: z.number().int().nonnegative().optional()
});

export const decisionSchema = z
  .object({
    id: idSchema,
    kind: decisionKindSchema,
    // The bundle (build) the decision was made on. Used to say "carried forward from".
    bundleId: idSchema,
    // The person who decided: a verified identity (the email claim of the signed-in person), never a value
    // typed into a form. For a delegated decision, the person who gave it in conversation.
    by: z.string().min(1),
    at: timestampSchema,
    // A person decides, in the portal (`human`) or in conversation with an agent that records it (`delegated`,
    // with `recordedBy` and the person's words in `comment`). `agent` exists only to import legacy records honestly.
    attestation: attestationSchema,
    recordedBy: z.string().min(1).optional(),
    scope: z
      .object({
        release: z.string().min(1).optional(),
        family: z.string().min(1).optional(),
        comparisonIds: z.array(idSchema).optional(),
        requirementIds: z.array(idSchema).optional()
      })
      .optional(),
    message: z.string().min(1).optional(),
    comment: z.string().optional(),
    reason: z.string().optional(),
    expiresAt: timestampSchema.optional(),
    binding: decisionBindingSchema.optional(),
    acknowledged: acknowledgedCountsSchema.optional(),
    // For a withdrawal: the decision it withdraws.
    target: idSchema.optional()
  })
  .superRefine((decision, context) => {
    if (decision.kind === 'changes-required' && !decision.message) {
      context.addIssue({ code: 'custom', path: ['message'], message: 'requiring changes needs a message saying what must change' });
    }
    if (decision.kind === 'withdrawn' && !decision.target) {
      context.addIssue({ code: 'custom', path: ['target'], message: 'a withdrawal must name the decision it withdraws' });
    }
    if (decision.kind !== 'withdrawn' && !decision.binding) {
      context.addIssue({ code: 'custom', path: ['binding'], message: 'a decision must record what it is bound to' });
    }
    if (decision.attestation === 'agent' && decision.kind !== 'accept-reference') {
      context.addIssue({ code: 'custom', path: ['attestation'], message: 'only a legacy reference approval may be agent-recorded; every other decision is a person\'s' });
    }
    if (decision.attestation === 'delegated') addDelegationIssues(decision, { path: 'comment', value: decision.comment }, context);
  });
export type Decision = z.output<typeof decisionSchema>;

export function verdictKey(verdict: Verdict): string {
  return `${verdict.status}/${verdict.severity}/${verdict.failureClass ?? '-'}`;
}

/** The binding as it stands now, for a decision to be made against or evaluated against. */
export function buildDecisionBinding(requirements: Requirement[], comparisons: Comparison[]): DecisionBinding {
  const verdicts: Record<string, string> = {};
  const references: Record<string, string> = {};
  const capturePolicies: Record<string, string> = {};
  for (const comparison of comparisons) {
    verdicts[comparison.id] = verdictKey(comparison.verdict);
    // The baseline file hash when the provider has it; otherwise the hash of the reference image as the run used it.
    const referenceHash = comparison.reference?.baselineSha256 ?? comparison.reference?.artifact.sha256;
    if (referenceHash) {
      references[comparison.id] = referenceHash;
    }
    if (comparison.capturePolicyHash) {
      capturePolicies[comparison.id] = comparison.capturePolicyHash;
    }
  }

  return { verdicts, references, capturePolicies, requirements: requirements.map((requirement) => requirement.id).sort() };
}

export type BindingChangeKind = 'verdict' | 'reference' | 'capture-policy' | 'requirement';

export interface BindingChange {
  kind: BindingChangeKind;
  id: string;
  change: 'changed' | 'added' | 'removed';
  from?: string;
  to?: string;
}

export type DecisionState =
  | { state: 'holds' }
  | { state: 'carried-forward'; from: string }
  | { state: 'lapsed'; causes: BindingChange[] }
  | { state: 'withdrawn' };

/**
 * Whether a decision still holds against the current evidence.
 * holds: nothing it was bound to changed, on the same bundle.
 * carried-forward: nothing changed, on a rebuilt bundle (shown as such, never silently).
 * lapsed: something changed; the causes name each changed check, reference, policy or requirement.
 */
export function evaluateDecision(decision: Decision, current: DecisionBinding, currentBundleId: string): DecisionState {
  if (decision.kind === 'withdrawn' || !decision.binding) {
    return { state: 'withdrawn' };
  }

  const causes = diffBinding(decision.binding, current);
  if (causes.length > 0) {
    return { state: 'lapsed', causes };
  }
  return decision.bundleId === currentBundleId ? { state: 'holds' } : { state: 'carried-forward', from: decision.bundleId };
}

function diffBinding(bound: DecisionBinding, current: DecisionBinding): BindingChange[] {
  return [
    ...diffRecords('verdict', bound.verdicts, current.verdicts),
    ...diffRecords('reference', bound.references, current.references),
    ...diffRecords('capture-policy', bound.capturePolicies, current.capturePolicies),
    ...diffIds(bound.requirements, current.requirements)
  ];
}

function diffRecords(kind: BindingChangeKind, bound: Record<string, string>, current: Record<string, string>): BindingChange[] {
  const changes: BindingChange[] = [];
  for (const id of Object.keys(bound).sort()) {
    const before = bound[id];
    const after = current[id];
    if (after === undefined) {
      changes.push({ kind, id, change: 'removed', ...(before !== undefined ? { from: before } : {}) });
    } else if (before !== after) {
      changes.push({ kind, id, change: 'changed', ...(before !== undefined ? { from: before } : {}), to: after });
    }
  }
  for (const id of Object.keys(current).sort()) {
    const after = current[id];
    if (!(id in bound) && after !== undefined) {
      changes.push({ kind, id, change: 'added', to: after });
    }
  }
  return changes;
}

function diffIds(bound: string[], current: string[]): BindingChange[] {
  const boundSet = new Set(bound);
  const currentSet = new Set(current);
  return [
    ...bound.filter((id) => !currentSet.has(id)).map((id): BindingChange => ({ kind: 'requirement', id, change: 'removed' })),
    ...current.filter((id) => !boundSet.has(id)).map((id): BindingChange => ({ kind: 'requirement', id, change: 'added' }))
  ];
}
