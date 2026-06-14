import { access } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createJiti } from 'jiti';
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

const VisualThresholdSchema = z.object({
  maxDiffPixels: z.number().int().nonnegative().optional(),
  maxDiffPixelRatio: z.number().min(0).max(1).optional()
});

const ViewportSizeSchema = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive()
});

const ComponentFramingSchema = z.object({
  rootSelector: z.string().min(1).optional(),
  background: z.string().min(1).optional(),
  align: z.enum(['center', 'start']).default('center'),
  padding: z.number().int().nonnegative().default(0)
});

const ComponentProbePartSchema = z.object({
  selector: z.string().min(1),
  bounds: z.boolean().default(true),
  styles: z.array(z.string().min(1)).default([]),
  cssVariables: z.array(z.string().min(1)).default([]),
  text: z.boolean().default(false)
});

const ComponentProbesSchema = z.object({
  parts: z.record(z.string().min(1), ComponentProbePartSchema).default({})
});

const RouteVisualSmokeCaseSchema = z.object({
  id: z.string().min(1),
  route: z.string().min(1),
  viewport: z.string().min(1),
  baseline: z.string().min(1),
  baselineRoot: z.string().optional(),
  threshold: VisualThresholdSchema.optional(),
  blocking: z.boolean().optional(),
  strict: z.boolean().optional()
});

const BrowserStorageSetupSchema = z.record(z.string().min(1), z.string()).optional().default({});

const BrowserSetupSchema = z
  .object({
    localStorage: BrowserStorageSetupSchema,
    sessionStorage: BrowserStorageSetupSchema
  })
  .default({ localStorage: {}, sessionStorage: {} });

const BrowserRouteSchema = z.object({
  id: z.string().min(1),
  name: z.string().optional(),
  path: z.string().min(1),
  viewports: z.array(z.string().min(1)).default(['desktop']),
  expects: z.array(BrowserExpectationSchema).default([]),
  setup: BrowserSetupSchema.optional()
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
  routes: z.array(BrowserRouteSchema).default([]),
  maskSelectors: z.array(z.string().min(1)).default([]),
  visualSmoke: z.array(RouteVisualSmokeCaseSchema).default([]),
  setup: BrowserSetupSchema.optional()
});

const DesignCommandSchema = z.object({
  id: z.string().min(1),
  command: z.string().min(1),
  cwd: z.string().min(1).optional(),
  blocking: z.boolean().optional()
});

const DesignContractSchema = z.object({
  enabled: z.boolean().default(true),
  commands: z.array(DesignCommandSchema).default([])
});

const ComponentBrowserStateSchema = z
  .object({
    kind: z.enum(['hover', 'focus']),
    selector: z.string().min(1),
    animationStabilization: z.object({
      disableAnimations: z.boolean().optional(),
      waitMs: z.number().int().nonnegative().max(5_000).optional()
    })
  })
  .superRefine((value, context) => {
    if (value.animationStabilization.disableAnimations !== true && (value.animationStabilization.waitMs ?? 0) <= 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['animationStabilization'],
        message: 'browser-forced pseudo states require effective animation stabilization'
      });
    }
  });

const ComponentVisualCaseSchema = z
  .object({
    id: z.string().min(1),
    storyId: z.string().min(1).optional(),
    path: z.string().min(1).optional(),
    viewport: z.string().min(1).default('component'),
    viewportSize: ViewportSizeSchema.optional(),
    framing: ComponentFramingSchema.optional(),
    baseline: z.string().min(1),
    baselineRoot: z.string().optional(),
    threshold: VisualThresholdSchema.optional(),
    blocking: z.boolean().optional(),
    strict: z.boolean().optional(),
    stateNote: z.string().min(1).optional(),
    browserState: ComponentBrowserStateSchema.optional(),
    probes: ComponentProbesSchema.optional()
  })
  .superRefine((value, context) => {
    if (value.storyId && value.path) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['storyId'],
        message: 'component visual cases must define either storyId or path, not both'
      });
    }

    if (!value.storyId && !value.path) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['storyId'],
        message: 'component visual cases must define storyId for Storybook or path for portal'
      });
    }

    if (value.path && !value.viewportSize) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['viewportSize'],
        message: 'portal component visual cases require viewportSize'
      });
    }
  });

const ComponentContractSchema = z
  .object({
    enabled: z.boolean().default(true),
    storybook: z
      .object({
        command: z.string(),
        readyUrl: z.string().url(),
        reuseExisting: z.boolean().default(true),
        timeoutMs: z.number().int().positive().default(60_000)
      })
      .optional(),
    portal: z
      .object({
        entry: z.string().min(1),
        readyUrl: z.string().url(),
        reuseExisting: z.boolean().default(true),
        timeoutMs: z.number().int().positive().default(60_000),
        viteConfig: z.string().min(1).optional()
      })
      .optional(),
    cases: z.array(ComponentVisualCaseSchema).default([])
  })
  .superRefine((value, context) => {
    for (const [index, visualCase] of value.cases.entries()) {
      if (visualCase.storyId && !value.storybook) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['cases', index, 'storyId'],
          message: 'storyId component visual cases require component.storybook'
        });
      }

      if (visualCase.path && !value.portal) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['cases', index, 'path'],
          message: 'path component visual cases require component.portal'
        });
      }
    }
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
    design: DesignContractSchema.optional(),
    component: ComponentContractSchema.optional(),
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

  return normalizeReflectionConfig(parsed.data);
}

function normalizeReflectionConfig(config: ReflectionConfig): ReflectionConfig {
  const component = config.contracts.component;
  if (!component) {
    return config;
  }

  return {
    ...config,
    contracts: {
      ...config.contracts,
      component: {
        ...component,
        cases: component.cases.map((visualCase) => {
          if (!visualCase.framing) {
            return visualCase;
          }

          return {
            ...visualCase,
            framing: {
              ...visualCase.framing,
              rootSelector: visualCase.framing.rootSelector ?? (visualCase.path ? '#reflection-root' : '#storybook-root')
            }
          };
        })
      }
    }
  };
}

export async function loadReflectionConfig(configPath: string): Promise<ReflectionConfig> {
  const resolvedConfigPath = resolve(configPath);

  try {
    await access(resolvedConfigPath);
  } catch {
    throw new Error(`Reflection config not found: ${configPath}`);
  }

  const module = await importConfigModule(resolvedConfigPath);
  if (!('default' in module)) {
    throw new Error(`Reflection config must use a default export: ${configPath}`);
  }

  return validateReflectionConfig(module.default);
}

async function importConfigModule(configPath: string): Promise<{ default?: unknown }> {
  const extension = extname(configPath);

  if (extension === '.ts' || extension === '.mts' || extension === '.cts') {
    const jiti = createJiti(import.meta.url, { moduleCache: false });
    const config = await jiti.import(configPath, { default: true });
    return { default: config };
  }

  const configUrl = pathToFileURL(configPath);
  configUrl.searchParams.set('reflectionLoad', Date.now().toString());

  return (await import(configUrl.href)) as { default?: unknown };
}
