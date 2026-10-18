import { z } from 'zod';
import { idSchema, sha256Schema, timestampSchema } from './primitives.js';

// The design data something was proven against. Reflection never interprets `kind` or `role`; the provider
// supplies the labels the UI shows. One projection can carry several snapshots (for example a full file sync
// and the older per-family capture a proof actually read), so their dates are never merged.
export const sourceSnapshotSchema = z.object({
  id: idSchema,
  kind: z.string().min(1),
  role: z.string().min(1),
  label: z.string().min(1).optional(),
  capturedAt: timestampSchema,
  upstreamModifiedAt: timestampSchema.optional(),
  version: z.string().min(1).optional(),
  sha256: sha256Schema.optional(),
  // Identity of the upstream file this snapshot was taken from, and of the original it was copied from, if any.
  fileKey: z.string().min(1).optional(),
  originalFileKey: z.string().min(1).optional(),
  note: z.string().optional()
});
export type SourceSnapshot = z.output<typeof sourceSnapshotSchema>;
