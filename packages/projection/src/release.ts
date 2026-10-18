import { z } from 'zod';
import { idSchema, timestampSchema } from './primitives.js';
import { coverageSummarySchema } from './requirement.js';

export const releaseManifestSchema = z.object({
  release: z.string().min(1),
  // A rebuilt candidate replaces its earlier build; the number says which one this is.
  build: z.number().int().positive(),
  bundleId: idSchema,
  state: z.enum(['candidate', 'released']),
  builtAt: timestampSchema,
  branch: z.string().min(1).optional(),
  commit: z.string().min(1).optional(),
  // The release this one is compared with, or null for the first release.
  previousRelease: z.string().min(1).nullable(),
  // Snapshots this release used. May equal the previous release's: not every release has a new sync.
  snapshotIds: z.array(idSchema)
});
export type ReleaseManifest = z.output<typeof releaseManifestSchema>;

const deltaEntrySchema = z.object({ comparisonId: idSchema, requirementId: idSchema.optional(), label: z.string().min(1).optional() });

// An element of the design source, identified by a stable logical key (never a transient node id).
const designChangeSchema = z.object({ key: z.string().min(1), label: z.string().min(1), kind: z.string().min(1), nodeId: z.string().min(1).optional() });

export const deltaSchema = z.object({
  against: z.string().min(1).nullable(),
  // True when this release used the same design snapshot as the previous one. Not the same as "nothing changed".
  sameSnapshot: z.boolean(),
  regressed: z.array(deltaEntrySchema),
  fixed: z.array(deltaEntrySchema),
  stillFailing: z.array(deltaEntrySchema.extend({ since: z.string().min(1), releases: z.number().int().positive() })),
  newlyEnrolled: z.array(idSchema),
  newInDesign: z.array(designChangeSchema),
  stillProposed: z.array(designChangeSchema.extend({ status: z.enum(['proposed', 'accepted', 'declined', 'deferred']), since: z.string().min(1) })),
  removedInDesign: z.array(designChangeSchema),
  coverage: z.object({ before: coverageSummarySchema.nullable(), after: coverageSummarySchema })
});
export type Delta = z.output<typeof deltaSchema>;
