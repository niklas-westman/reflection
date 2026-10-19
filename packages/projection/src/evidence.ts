import { z } from 'zod';
import { idSchema, sha256Schema, timestampSchema } from './primitives.js';

// Same shape the engine writes to report.inputs[]. A provider adds `composite`: one hash it computes itself over
// a declared set of files (the key names the set, for example `app:src,public,index.html`), compared like any other.
export const reportInputSchema = z.object({
  role: z.string().min(1),
  key: z.string().min(1),
  hashKind: z.enum(['bytes', 'canonical-json', 'composite']),
  sha256: sha256Schema.optional(),
  bytes: z.number().int().nonnegative().optional(),
  missing: z.boolean().optional()
});
export type ReportInput = z.output<typeof reportInputSchema>;

export const runSchema = z.object({
  id: idSchema,
  startedAt: timestampSchema.optional(),
  finishedAt: timestampSchema,
  engine: z.object({ name: z.string().min(1), version: z.string().min(1).optional() }),
  runner: z.record(z.string(), z.unknown()).optional(),
  scope: z.string().min(1).optional(),
  inputs: z.array(reportInputSchema).optional(),
  verdictHash: sha256Schema.optional(),
  measuredHash: sha256Schema.optional(),
  // What the producing tool stored about its own validity. Shown as "native", never trusted.
  nativeValidity: z.string().min(1).optional()
});
export type Run = z.output<typeof runSchema>;

export type InputChangeKind = 'changed' | 'added' | 'removed';

export interface InputChange {
  role: string;
  key: string;
  change: InputChangeKind;
}

export type Validity =
  | { state: 'current' }
  | { state: 'stale'; causes: InputChange[] }
  | { state: 'invalid'; reasons: string[] }
  | { state: 'never-run' }
  | { state: 'offline' };

export interface ComputeValidityOptions {
  // Integrity problems (a hash mismatch, the wrong source file). Any makes the evidence invalid, not just stale.
  integrityFailures?: string[] | undefined;
}

/**
 * Whether recorded evidence still matches the inputs as they are now. Pure: the caller hashes the current
 * inputs (the engine's hashReportInputs does this) and passes both lists.
 * - no recorded run: never-run
 * - no current inputs to compare (an offline bundle): offline, freshness not verified
 * - otherwise current, or stale with the exact list of changed inputs
 */
export function computeValidity(
  recorded: ReportInput[] | undefined,
  current: ReportInput[] | undefined,
  options: ComputeValidityOptions = {}
): Validity {
  if (options.integrityFailures && options.integrityFailures.length > 0) {
    return { state: 'invalid', reasons: options.integrityFailures };
  }
  if (recorded === undefined) {
    return { state: 'never-run' };
  }
  if (current === undefined) {
    return { state: 'offline' };
  }

  const causes = diffInputs(recorded, current);
  return causes.length === 0 ? { state: 'current' } : { state: 'stale', causes };
}

function diffInputs(recorded: ReportInput[], current: ReportInput[]): InputChange[] {
  const recordedByKey = indexByRoleAndKey(recorded);
  const currentByKey = indexByRoleAndKey(current);
  const causes: InputChange[] = [];

  for (const [id, before] of recordedByKey) {
    const after = currentByKey.get(id);
    const change = describeChange(before, after);
    if (change) {
      causes.push({ role: before.role, key: before.key, change });
    }
  }
  for (const [id, after] of currentByKey) {
    if (!recordedByKey.has(id) && after.missing !== true) {
      causes.push({ role: after.role, key: after.key, change: 'added' });
    }
  }

  return causes.sort((a, b) => `${a.role}\u0000${a.key}`.localeCompare(`${b.role}\u0000${b.key}`));
}

function describeChange(before: ReportInput, after: ReportInput | undefined): InputChangeKind | undefined {
  const existedBefore = before.missing !== true;
  const existsNow = after !== undefined && after.missing !== true;
  if (existedBefore && !existsNow) {
    return 'removed';
  }
  if (!existedBefore && existsNow) {
    return 'added';
  }
  if (existedBefore && existsNow && (before.sha256 !== after.sha256 || before.hashKind !== after.hashKind)) {
    return 'changed';
  }
  return undefined;
}

function indexByRoleAndKey(inputs: ReportInput[]): Map<string, ReportInput> {
  return new Map(inputs.map((input) => [`${input.role}\u0000${input.key}`, input]));
}
