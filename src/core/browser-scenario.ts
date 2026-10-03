import { z } from 'zod';

const StepLocatorSchema = z.union([
  z.object({ role: z.string().min(1), name: z.string().optional() }).strict(),
  z.object({ label: z.string().min(1) }).strict(),
  z.object({ text: z.string().min(1) }).strict(),
  z.object({ selector: z.string().min(1) }).strict()
]);

const StepFillTargetSchema = z.union([
  z.object({ role: z.string().min(1), name: z.string().optional(), value: z.string() }).strict(),
  z.object({ label: z.string().min(1), value: z.string() }).strict(),
  z.object({ selector: z.string().min(1), value: z.string() }).strict()
]);

const StepWaitForSchema = z.union([
  z.object({ role: z.string().min(1), name: z.string().optional(), timeoutMs: z.number().int().positive().optional() }).strict(),
  z.object({ label: z.string().min(1), timeoutMs: z.number().int().positive().optional() }).strict(),
  z.object({ text: z.string().min(1), timeoutMs: z.number().int().positive().optional() }).strict(),
  z.object({ selector: z.string().min(1), timeoutMs: z.number().int().positive().optional() }).strict(),
  z.object({ networkIdle: z.literal(true), timeoutMs: z.number().int().positive().optional() }).strict()
]);

export const BrowserStepSchema = z.union([
  z.object({ click: StepLocatorSchema }).strict(),
  z.object({ fill: StepFillTargetSchema }).strict(),
  z.object({ press: z.string().min(1) }).strict(),
  z.object({ waitFor: StepWaitForSchema }).strict()
]);

export type BrowserStep = z.output<typeof BrowserStepSchema>;

const StateIdPattern = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export const StateIdSchema = z.string().regex(StateIdPattern, 'state ids may contain letters, digits, ".", "_" and "-" and must start with a letter or digit');

function isSafeRelativeFilePath(path: string): boolean {
  return !path.startsWith('/') && !/^[A-Za-z]:/.test(path) && !path.split(/[\\/]/).includes('..');
}

const NetworkStubSchema = z
  .object({
    method: z
      .string()
      .min(1)
      .transform((method) => method.toUpperCase())
      .optional(),
    url: z.string().min(1),
    status: z.number().int().min(100).max(599).default(200),
    json: z.unknown().optional(),
    file: z.string().min(1).optional(),
    body: z.string().optional(),
    headers: z.record(z.string().min(1), z.string()).optional(),
    delayMs: z.number().int().nonnegative().max(30_000).optional(),
    once: z.boolean().optional()
  })
  .strict()
  .superRefine((stub, context) => {
    const bodySources = [stub.json !== undefined, stub.file !== undefined, stub.body !== undefined].filter(Boolean).length;
    if (bodySources > 1) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'a network stub may define at most one of json, file or body' });
    }

    if (stub.file !== undefined && !isSafeRelativeFilePath(stub.file)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['file'], message: 'stub files must be relative paths inside the config directory' });
    }
  });

export const NetworkSetupSchema = z
  .object({
    stubs: z.array(NetworkStubSchema).default([]),
    unmatched: z.enum(['fail', 'warn', 'allow']).default('allow'),
    allowOrigins: z.array(z.string().min(1)).default([])
  })
  .strict();

export const ClockSetupSchema = z
  .object({
    now: z.string().refine((value) => !Number.isNaN(new Date(value).getTime()), 'clock.now must be a valid date-time, e.g. 2026-10-03T09:00:00+02:00')
  })
  .strict();

export const StabilitySchema = z
  .object({
    disableAnimations: z.boolean().optional(),
    hideCaret: z.boolean().optional(),
    waitFor: z.array(z.enum(['fonts', 'images'])).optional(),
    settleMs: z.number().int().nonnegative().max(5_000).optional()
  })
  .strict();

export type NetworkSetup = z.input<typeof NetworkSetupSchema>;
export type NetworkStubConfig = NonNullable<NetworkSetup['stubs']>[number];
export type ClockSetup = z.output<typeof ClockSetupSchema>;
export type BrowserStability = z.output<typeof StabilitySchema>;
