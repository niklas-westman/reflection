import { z } from 'zod';
import { idSchema, relativePathSchema, sha256Schema, timestampSchema } from './primitives.js';
import { proofSchema } from './proof.js';
import { subjectSchema } from './requirement.js';

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
// attestation says who made the statement: a record written by an agent is not a human approval.
export const referenceApprovalSchema = z
  .object({
    state: z.enum(['holds', 'lapsed', 'none']),
    attestation: z.enum(['human', 'agent']).optional(),
    by: z.string().min(1).optional(),
    at: timestampSchema.optional(),
    boundTo: sha256Schema.optional(),
    causes: z.array(z.string()).optional(),
    note: z.string().optional()
  })
  .refine((approval) => approval.state === 'none' || approval.attestation !== undefined, {
    message: 'an approval that holds or has lapsed must say whether a human or an agent recorded it'
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
      metric: z.object({ name: z.string().min(1), value: z.number(), ratio: z.number().optional(), diffPixels: z.number().int().nonnegative().optional() }),
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
