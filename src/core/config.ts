import { access } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';

export const runModes = ['smoke', 'design', 'visual', 'full'] as const;
export type RunMode = (typeof runModes)[number];

const BrowserExpectationSchema = z.union([
  z.object({ urlIncludes: z.string() }),
  z.object({ urlEquals: z.string() }),
  z.object({ role: z.string(), name: z.string().optional() }),
  z.object({ label: z.string() }),
  z.object({ text: z.string() }),
  z.object({ noText: z.string() }),
  z.object({ selector: z.string() }),
  z.object({ elementVisible: z.string() }),
  z.object({ elementNotVisible: z.string() }),
  z.object({ noHorizontalOverflow: z.literal(true) }),
  z.object({ noConsoleErrors: z.literal(true) }),
  z.object({ screenshot: z.string() })
]);

const BrowserRouteSchema = z.object({
  id: z.string().min(1),
  name: z.string().optional(),
  path: z.string().min(1),
  viewports: z.array(z.string().min(1)).default(['desktop']),
  expects: z.array(BrowserExpectationSchema).default([])
});

const BrowserContractSchema = z.object({
  enabled: z.boolean().default(true),
  blocking: z.boolean().default(true),
  baseUrl: z.string().url(),
  server: z
    .object({
      command: z.string(),
      readyUrl: z.string().url(),
      reuseExisting: z.boolean().default(true),
      timeoutMs: z.number().int().positive().default(60_000)
    })
    .optional(),
  routes: z.array(BrowserRouteSchema).default([])
});

const ReflectionConfigSchema = z.object({
  project: z.string().min(1),
  run: z
    .object({
      defaultMode: z.enum(runModes).default('smoke'),
      ciMode: z.enum(runModes).default('smoke')
    })
    .default({ defaultMode: 'smoke', ciMode: 'smoke' }),
  contracts: z.object({
    browser: BrowserContractSchema.optional(),
    design: z.unknown().optional(),
    visual: z.unknown().optional()
  })
});

export type ReflectionConfigInput = z.input<typeof ReflectionConfigSchema>;
export type ReflectionConfig = z.output<typeof ReflectionConfigSchema>;

export function isRunMode(value: string): value is RunMode {
  return runModes.includes(value as RunMode);
}

export function validateReflectionConfig(input: unknown): ReflectionConfig {
  const parsed = ReflectionConfigSchema.safeParse(input);
  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => `${issue.path.join('.') || 'config'}: ${issue.message}`).join('; ');
    throw new Error(`Invalid Reflection config: ${details}`);
  }

  return parsed.data;
}

export async function loadReflectionConfig(configPath: string): Promise<ReflectionConfig> {
  try {
    await access(configPath);
  } catch {
    throw new Error(`Reflection config not found: ${configPath}`);
  }

  const configUrl = pathToFileURL(configPath);
  configUrl.searchParams.set('reflectionLoad', Date.now().toString());

  const module = (await import(configUrl.href)) as { default?: unknown };
  if (!('default' in module)) {
    throw new Error(`Reflection config must use a default export: ${configPath}`);
  }

  return validateReflectionConfig(module.default);
}
