import { z } from 'zod';
import type { Comparison } from './comparison.js';
import { idSchema } from './primitives.js';
import { proofLayerSchema } from './proof.js';

export const subjectSchema = z.object({
  kind: z.enum(['component', 'page']),
  id: idSchema,
  variant: z.string().min(1).optional(),
  mode: z.string().min(1).optional(),
  adapter: z.string().min(1).optional(),
  viewport: z.string().min(1).optional(),
  state: z.string().min(1).optional(),
  // Provider-defined dimensions beyond the common ones (size, icon placement, locale, density ...).
  dimensions: z.record(z.string().min(1), z.string()).optional()
});
export type Subject = z.output<typeof subjectSchema>;

const COMMON_SUBJECT_KEYS = ['variant', 'mode', 'adapter', 'viewport', 'state'] as const;

/** A subject's value for a dimension named by a common key or a key of `dimensions`; undefined when it has none. */
export function subjectDimension(subject: Subject, key: string): string | undefined {
  const common = (COMMON_SUBJECT_KEYS as readonly string[]).includes(key) ? subject[key as (typeof COMMON_SUBJECT_KEYS)[number]] : undefined;
  return common ?? subject.dimensions?.[key];
}

export const designAvailabilitySchema = z.enum(['available', 'missing', 'unmapped']);

export const requirementSchema = z.object({
  id: idSchema,
  label: z.string().min(1).optional(),
  subject: subjectSchema,
  requiredProofs: z.array(proofLayerSchema).min(1),
  // The implementations (adapters) that must each pass before the item counts as proven. Absent: only the
  // comparisons that were recorded count, which is what a provider without a fixed set of implementations wants.
  requiredImplementations: z.array(z.string().min(1)).min(1).optional(),
  // A comparison is set up for this requirement (a fixture exists and is wired in).
  enrolled: z.boolean(),
  design: z
    .object({
      // missing: no design exists to compare against. unmapped: a design may exist but is not mapped to this requirement.
      availability: designAvailabilitySchema,
      nodeId: z.string().min(1).optional(),
      snapshotId: idSchema.optional(),
      reason: z.string().optional()
    })
    .optional()
});
export type Requirement = z.output<typeof requirementSchema>;

export type Readiness = 'proven' | 'failing' | 'needs-design' | 'not-enrolled' | 'unknown';

// Which readiness buckets the provider has a concept of. A bucket it lacks is reported as unknown, never as zero.
export interface ReadinessConcepts {
  needsDesign: boolean;
  notEnrolled: boolean;
}

/**
 * The required implementations that have no comparison at all. Empty when the requirement declares none.
 * A comparison without an adapter never satisfies a named implementation.
 */
export function missingImplementations(requirement: Requirement, comparisons: Comparison[]): string[] {
  const compared = new Set(comparisons.filter((comparison) => comparison.requirementId === requirement.id).flatMap((comparison) => (comparison.subject.adapter ? [comparison.subject.adapter] : [])));
  return (requirement.requiredImplementations ?? []).filter((implementation) => !compared.has(implementation));
}

/**
 * Readiness of one requirement, derived from the requirement and its comparisons. Never stored.
 * proven needs every required proof layer to have passed in every comparison; a layer that is not-run or
 * unsupported can never count as a pass. When the requirement names required implementations, each of them must
 * also have been compared: a missing one leaves the item not proven (a failure still reads as failing).
 */
export function deriveReadiness(requirement: Requirement, comparisons: Comparison[], concepts: ReadinessConcepts): Readiness {
  if (requirement.design?.availability === 'missing') {
    return concepts.needsDesign ? 'needs-design' : 'unknown';
  }
  if (!requirement.enrolled || requirement.design?.availability === 'unmapped') {
    return concepts.notEnrolled ? 'not-enrolled' : 'unknown';
  }

  const own = comparisons.filter((comparison) => comparison.requirementId === requirement.id);
  if (own.length === 0) {
    return 'unknown';
  }
  if (own.some((comparison) => requirement.requiredProofs.some((layer) => comparison.proof[layer] === 'failed'))) {
    return 'failing';
  }
  if (missingImplementations(requirement, own).length > 0) {
    return 'unknown';
  }
  return own.every((comparison) => requirement.requiredProofs.every((layer) => comparison.proof[layer] === 'passed')) ? 'proven' : 'unknown';
}

export const coverageSummarySchema = z
  .object({
    required: z.number().int().nonnegative(),
    proven: z.number().int().nonnegative(),
    failing: z.number().int().nonnegative(),
    // null: the provider has no such concept. Render as unknown, never 0.
    needsDesign: z.number().int().nonnegative().nullable(),
    notEnrolled: z.number().int().nonnegative().nullable(),
    // Requirements whose readiness cannot be determined.
    unknown: z.number().int().nonnegative()
  })
  .refine((summary) => summary.required === sumOfBuckets(summary), { message: 'required must equal the sum of the readiness buckets' });
export type CoverageSummary = z.output<typeof coverageSummarySchema>;

interface ReadinessBuckets {
  proven: number;
  failing: number;
  needsDesign: number | null;
  notEnrolled: number | null;
  unknown: number;
}

function sumOfBuckets(summary: ReadinessBuckets): number {
  return summary.proven + summary.failing + (summary.needsDesign ?? 0) + (summary.notEnrolled ?? 0) + summary.unknown;
}

/** The one place readiness is counted. Every number in a view must come from here. */
export function summarizeReadiness(requirements: Requirement[], comparisons: Comparison[], concepts: ReadinessConcepts): CoverageSummary {
  const counts: Record<Readiness, number> = { proven: 0, failing: 0, 'needs-design': 0, 'not-enrolled': 0, unknown: 0 };
  for (const requirement of requirements) {
    counts[deriveReadiness(requirement, comparisons, concepts)] += 1;
  }

  return {
    required: requirements.length,
    proven: counts.proven,
    failing: counts.failing,
    needsDesign: concepts.needsDesign ? counts['needs-design'] : null,
    notEnrolled: concepts.notEnrolled ? counts['not-enrolled'] : null,
    unknown: counts.unknown
  };
}

