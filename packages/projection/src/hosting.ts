import { z } from 'zod';
import type { BundleManifest } from './bundle-manifest.js';
import { buildDecisionBinding, decisionSchema, type Decision } from './decision.js';
import { idSchema, sha256Schema, timestampSchema } from './primitives.js';
import { summarizeProjection, type Projection } from './projection.js';

// What a host serves next to the viewer as `index.json`: the bundles it holds, which one is the latest per
// project, and the archive summaries of releases whose evidence was removed. The publish step writes it.
export const releaseIndexEntrySchema = z.object({
  id: idSchema,
  project: idSchema,
  release: z.string().min(1),
  build: z.number().int().positive(),
  state: z.enum(['candidate', 'released']),
  builtAt: timestampSchema,
  bundleHash: sha256Schema
});
export type ReleaseIndexEntry = z.output<typeof releaseIndexEntrySchema>;

export const releaseIndexSchema = z.object({
  schemaVersion: z.literal(1),
  generatedAt: timestampSchema,
  bundles: z.array(releaseIndexEntrySchema),
  // Project id to the bundle that is the latest for it, or null when there is none. Explicit on purpose: a viewer
  // whose latest bundle is missing or invalid says so, and never falls back to another one.
  latest: z.record(idSchema, idSchema.nullable()).default({}),
  // Archive summaries, validated one by one by the reader, so one unreadable summary does not hide the others.
  archive: z.array(z.unknown()).default([])
});
export type ReleaseIndex = z.output<typeof releaseIndexSchema>;

// What a viewer sends to record a decision. Identity, the binding and the counts are never part of it: the
// server takes the identity from the verified sign-in and computes the rest from the stored bundle.
export const recordDecisionRequestSchema = z
  .object({
    bundleId: idSchema,
    kind: z.enum(['approve', 'changes-required', 'withdrawn']),
    message: z.string().trim().min(1).optional(),
    comment: z.string().trim().min(1).optional(),
    // For a withdrawal: the decision it withdraws.
    target: idSchema.optional()
  })
  .superRefine((request, context) => {
    if (request.kind === 'changes-required' && !request.message) {
      context.addIssue({ code: 'custom', path: ['message'], message: 'requiring changes needs a message saying what must change' });
    }
    if (request.kind === 'withdrawn' && !request.target) {
      context.addIssue({ code: 'custom', path: ['target'], message: 'a withdrawal must name the decision it withdraws' });
    }
  });
export type RecordDecisionRequest = z.output<typeof recordDecisionRequestSchema>;

// What the decision API returns for a release: every record, oldest first. Records are append-only.
export const decisionListSchema = z.object({ decisions: z.array(decisionSchema) });
export type DecisionList = z.output<typeof decisionListSchema>;

export class DecisionRequestError extends Error {
  constructor(
    readonly code: 'bundle-mismatch' | 'invalid-request',
    message: string
  ) {
    super(message);
    this.name = 'DecisionRequestError';
  }
}

export interface RecordDecisionInput {
  request: RecordDecisionRequest;
  // The bundle as the host stores it, never as the browser describes it.
  bundle: { manifest: BundleManifest; projection: Projection };
  // Verified by the host (the signed-in email). The host also checks the approver list before calling this.
  identity: { email: string };
  id: string;
  at: string;
}

/**
 * The decision record for a request, built on the server from the stored bundle: the binding to the content it
 * judges, and the counts it acknowledges, so "approved" can never be read as "no issues". Pure: storing the
 * record, checking the approver list and posting a message are the host's.
 */
export function recordDecision({ request, bundle, identity, id, at }: RecordDecisionInput): Decision {
  const parsed = recordDecisionRequestSchema.safeParse(request);
  if (!parsed.success) {
    throw new DecisionRequestError('invalid-request', parsed.error.issues.map((issue) => issue.message).join('; '));
  }
  const { manifest, projection } = bundle;
  if (parsed.data.bundleId !== manifest.release.bundleId) {
    throw new DecisionRequestError('bundle-mismatch', `the request names bundle "${parsed.data.bundleId}", the stored bundle is "${manifest.release.bundleId}"`);
  }

  const common = {
    id,
    kind: parsed.data.kind,
    bundleId: manifest.release.bundleId,
    by: identity.email,
    at,
    attestation: 'human' as const,
    scope: { release: manifest.release.release },
    ...(parsed.data.message ? { message: parsed.data.message } : {}),
    ...(parsed.data.comment ? { comment: parsed.data.comment } : {})
  };
  if (parsed.data.kind === 'withdrawn') {
    return decisionSchema.parse({ ...common, target: parsed.data.target });
  }

  const summary = summarizeProjection(projection);
  const delta = projection.delta;
  return decisionSchema.parse({
    ...common,
    binding: buildDecisionBinding(projection.requirements, projection.comparisons),
    acknowledged: {
      missing: summary.required - summary.proven - summary.failing,
      ...(delta ? { regressed: delta.regressed.length, fixed: delta.fixed.length, stillFailing: delta.stillFailing.length, newInDesign: delta.newInDesign.length } : {})
    }
  });
}
