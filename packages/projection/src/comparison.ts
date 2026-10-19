import { z } from 'zod';
import { idSchema, relativePathSchema, sha256Schema, timestampSchema } from './primitives.js';
import { proofSchema } from './proof.js';
import { subjectSchema } from './requirement.js';
import { addDelegationIssues, attestationSchema } from './attestation.js';

export const artifactSchema = z.object({
  role: z.enum(['reference', 'actual', 'diff', 'debug']),
  path: relativePathSchema,
  sha256: sha256Schema.optional(),
  mime: z.string().min(1).optional(),
  bytes: z.number().int().nonnegative().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional()
});
export type Artifact = z.output<typeof artifactSchema>;

// "Is this design export the approved truth." Separate from review of results.
// state: holds (bound to the reference hashes), lapsed (they changed), none (never approved).
// attestation says who made the statement: `human` (a person recorded it), `delegated` (a person gave it in
// conversation and an agent wrote it down; `by` is the person, `recordedBy` the agent, `note` the person's
// words) or `agent` (no person behind it). Only `agent` is not a person's approval.
// boundTo is the hash of the design source content the approval named (the same value as the snapshot's
// sha256 when the snapshot hashes that content), never the bundle manifest.
export const referenceApprovalSchema = z
  .object({
    state: z.enum(['holds', 'lapsed', 'none']),
    attestation: attestationSchema.optional(),
    by: z.string().min(1).optional(),
    recordedBy: z.string().min(1).optional(),
    at: timestampSchema.optional(),
    boundTo: sha256Schema.optional(),
    causes: z.array(z.string()).optional(),
    note: z.string().optional()
  })
  .superRefine((approval, context) => {
    if (approval.state !== 'none' && approval.attestation === undefined) {
      context.addIssue({ code: 'custom', path: ['attestation'], message: 'an approval that holds or has lapsed must say whether a person, a person through an agent, or an agent recorded it' });
    }
    if (approval.attestation === 'delegated') addDelegationIssues(approval, { path: 'note', value: approval.note }, context);
  });
export type ReferenceApproval = z.output<typeof referenceApprovalSchema>;

// What the engine reported for this check, in its own words. A decision binds to these entries,
// so they must exclude anything that differs between identical runs.
export const verdictSchema = z.object({
  status: z.enum(['pass', 'warn', 'fail', 'skipped', 'error']),
  severity: z.enum(['blocking', 'review', 'info']),
  failureClass: z.string().min(1).optional()
});
export type Verdict = z.output<typeof verdictSchema>;

export const measurementSampleSchema = z.object({
  part: z.string().min(1),
  property: z.string().min(1),
  expected: z.string(),
  actual: z.string(),
  delta: z.string().optional(),
  tolerance: z.string().optional(),
  passed: z.boolean(),
  tokenChain: z.array(z.string()).optional(),
  sourceNodeId: z.string().min(1).optional()
});

// The number a pixel comparison produced. `name` is the tool's id for it; `label`, `unit`, `direction` and
// `passAt` (the passing line, in the same unit) let a viewer say what it means without the tool's documentation.
export const diffMetricSchema = z.object({
  name: z.string().min(1),
  value: z.number(),
  ratio: z.number().optional(),
  diffPixels: z.number().int().nonnegative().optional(),
  label: z.string().min(1).optional(),
  unit: z.string().min(1).optional(),
  direction: z.enum(['higher-is-better', 'lower-is-better']).optional(),
  passAt: z.number().optional()
});
export type DiffMetric = z.output<typeof diffMetricSchema>;

export const comparisonSchema = z.object({
  id: idSchema,
  // Joins the comparison to its requirement by exact identity. Engine case `ref` lands here.
  requirementId: idSchema.optional(),
  subject: subjectSchema,
  snapshotId: idSchema.optional(),
  runId: idSchema.optional(),
  sourceNodeIds: z.array(z.string().min(1)).optional(),
  reference: z
    .object({
      artifact: artifactSchema,
      baselineSha256: sha256Schema.optional(),
      baselineCreatedAt: timestampSchema.optional(),
      origin: z.string().min(1).optional(),
      approval: referenceApprovalSchema
    })
    .optional(),
  actual: artifactSchema.optional(),
  diff: z
    .object({
      artifact: artifactSchema.optional(),
      metric: diffMetricSchema,
      threshold: z.record(z.string(), z.number()).optional()
    })
    .optional(),
  measurements: z.object({ total: z.number().int().nonnegative(), passed: z.number().int().nonnegative(), samples: z.array(measurementSampleSchema) }).optional(),
  proof: proofSchema,
  verdict: verdictSchema,
  // Hash of the capture policy the screenshot was taken under; evidence under another policy is not comparable.
  capturePolicyHash: sha256Schema.optional(),
  // The producing tool's own word for the outcome, kept for reference. Never part of the shared meaning.
  nativeOutcome: z.string().optional(),
  limitations: z.array(z.string()).optional()
});
export type Comparison = z.output<typeof comparisonSchema>;
