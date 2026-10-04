import { access } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createJiti } from 'jiti';
import { z } from 'zod';
import { BrowserStepSchema, ClockSetupSchema, MaskSelectorSchema, NetworkSetupSchema, StabilitySchema, StateIdSchema } from './browser-scenario.js';
import { RouteViewportsSchema, ViewportSizeSchema } from './viewport.js';

export const runModes = ['smoke', 'design', 'visual', 'print', 'full'] as const;
export type RunMode = (typeof runModes)[number];

const MatchOptionsFields = {
  exact: z.boolean().optional(),
  visible: z.boolean().optional(),
  enabled: z.boolean().optional()
};

const BrowserExpectationSchema = z.union([
  z.strictObject({ urlIncludes: z.string() }),
  z.strictObject({ urlEquals: z.string() }),
  z.strictObject({ role: z.string(), name: z.string().optional(), ...MatchOptionsFields }),
  z.strictObject({ label: z.string(), ...MatchOptionsFields }),
  z.strictObject({ text: z.string(), exact: z.boolean().optional(), visible: z.boolean().optional() }),
  z.strictObject({ noText: z.string() }),
  z.strictObject({ selector: z.string() }),
  z.strictObject({ elementVisible: z.string() }),
  z.strictObject({ elementNotVisible: z.string() }),
  z.strictObject({ selectorCount: z.strictObject({ selector: z.string().min(1), equals: z.number().int().nonnegative() }) }),
  z.strictObject({ noSelector: z.string().min(1) }),
  z.strictObject({ noHorizontalOverflow: z.literal(true) }),
  z.strictObject({ noConsoleErrors: z.literal(true) }),
  z.strictObject({ screenshot: z.string() })
]);

const VisualThresholdSchema = z.strictObject({
  maxDiffPixels: z.number().int().nonnegative().optional(),
  maxDiffPixelRatio: z.number().min(0).max(1).optional()
});

const ComponentFramingSchema = z.strictObject({
  rootSelector: z.string().min(1).optional(),
  background: z.string().min(1).optional(),
  align: z.enum(['center', 'start']).default('center'),
  padding: z.number().int().nonnegative().default(0)
});

const ComponentProbePartSchema = z.strictObject({
  selector: z.string().min(1),
  bounds: z.boolean().default(true),
  styles: z.array(z.string().min(1)).default([]),
  cssVariables: z.array(z.string().min(1)).default([]),
  text: z.boolean().default(false)
});

const ComponentProbesSchema = z.strictObject({
  parts: z.record(z.string().min(1), ComponentProbePartSchema).default({})
});

const RouteVisualSmokeCaseSchema = z.strictObject({
  id: z.string().min(1),
  route: z.string().min(1),
  viewport: z.string().min(1),
  state: StateIdSchema.optional(),
  capture: z.strictObject({ selector: z.string().min(1) }).optional(),
  baseline: z.string().min(1),
  baselineRoot: z.string().optional(),
  threshold: VisualThresholdSchema.optional(),
  blocking: z.boolean().optional(),
  strict: z.boolean().optional(),
  scenario: z.string().min(1).optional()
});

const BrowserStorageSetupSchema = z.record(z.string().min(1), z.string()).optional().default({});

const BrowserSetupSchema = z
  .strictObject({
    localStorage: BrowserStorageSetupSchema,
    sessionStorage: BrowserStorageSetupSchema,
    network: NetworkSetupSchema.optional(),
    clock: ClockSetupSchema.optional(),
    timezone: z.string().min(1).optional(),
    locale: z.string().min(1).optional(),
    colorScheme: z.enum(['light', 'dark']).optional(),
    reducedMotion: z.enum(['reduce', 'no-preference']).optional()
  })
  .default({ localStorage: {}, sessionStorage: {} });

const BrowserRouteStateSchema = z.strictObject({
  id: StateIdSchema,
  name: z.string().optional(),
  path: z.string().min(1).optional(),
  steps: z.array(BrowserStepSchema).default([]),
  expects: z.array(BrowserExpectationSchema).default([]),
  maskSelectors: z.array(MaskSelectorSchema).optional(),
  setup: BrowserSetupSchema.optional()
});

const BrowserRouteSchema = z
  .strictObject({
    id: z.string().min(1),
    name: z.string().optional(),
    path: z.string().min(1),
    viewports: RouteViewportsSchema,
    capture: z.strictObject({ fullPage: z.boolean().optional() }).optional(),
    stability: StabilitySchema.optional(),
    maskSelectors: z.array(MaskSelectorSchema).optional(),
    expects: z.array(BrowserExpectationSchema).default([]),
    states: z.array(BrowserRouteStateSchema).min(1).optional(),
    setup: BrowserSetupSchema.optional()
  })
  .superRefine((route, context) => {
    const seen = new Set<string>();
    for (const [index, state] of (route.states ?? []).entries()) {
      if (seen.has(state.id)) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['states', index, 'id'], message: `duplicate state id "${state.id}"` });
      }
      seen.add(state.id);
    }
  });

const BrowserContractSchema = z.strictObject({
  enabled: z.boolean().default(true),
  blocking: z.boolean().default(true),
  baseUrl: z.string().url(),
  server: z
  .strictObject({
      command: z.string(),
      readyUrl: z.string().url(),
      reuseExisting: z.boolean().default(true),
      timeoutMs: z.number().int().positive().default(60_000)
    })
    .optional(),
  routes: z.array(BrowserRouteSchema).default([]),
  maskSelectors: z.array(MaskSelectorSchema).default([]),
  visualSmoke: z.array(RouteVisualSmokeCaseSchema).default([]),
  stability: StabilitySchema.optional(),
  setup: BrowserSetupSchema.optional()
}).superRefine((browser, context) => {
  for (const [index, visualCase] of browser.visualSmoke.entries()) {
    const route = browser.routes.find((candidate) => candidate.id === visualCase.route);
    if (!route) {
      continue;
    }

    const stateIds = (route.states ?? []).map((state) => state.id);
    if (stateIds.length === 0 && visualCase.state !== undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['visualSmoke', index, 'state'],
        message: `route "${route.id}" has no states, so visualSmoke case "${visualCase.id}" cannot set state "${visualCase.state}"`
      });
    }

    if (stateIds.length > 0 && visualCase.state === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['visualSmoke', index, 'state'],
        message: `route "${route.id}" has states (${stateIds.join(', ')}); set state on visualSmoke case "${visualCase.id}"`
      });
    }

    if (visualCase.state !== undefined && stateIds.length > 0 && !stateIds.includes(visualCase.state)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['visualSmoke', index, 'state'],
        message: `route "${route.id}" has no state "${visualCase.state}" (available: ${stateIds.join(', ')})`
      });
    }
  }
});

const DesignCommandSchema = z.strictObject({
  id: z.string().min(1),
  command: z.string().min(1),
  cwd: z.string().min(1).optional(),
  blocking: z.boolean().optional()
});

const DesignContractSchema = z.strictObject({
  enabled: z.boolean().default(true),
  commands: z.array(DesignCommandSchema).default([])
});

const LifecycleArtifactSchema = z.strictObject({
  path: z.string().min(1),
  type: z.enum(['html', 'metadata', 'log', 'report', 'screenshot', 'image', 'visual-diff', 'trace', 'video', 'pdf', 'document-page', 'contact-sheet']),
  role: z.enum(['evidence', 'expected', 'actual', 'diff', 'trace', 'debug']).optional()
});

const LifecycleHookSchema = z.strictObject({
  id: z.string().min(1),
  command: z.string().min(1),
  cwd: z.string().min(1).optional(),
  timeoutMs: z.number().int().positive().default(60_000),
  blocking: z.boolean().default(true),
  scenario: z.string().min(1).optional(),
  artifacts: z.array(LifecycleArtifactSchema).default([])
});

const ComponentBrowserStateSchema = z
  .strictObject({
    kind: z.enum(['hover', 'focus']),
    selector: z.string().min(1),
    animationStabilization: z.strictObject({
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
  .strictObject({
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
  .strictObject({
    enabled: z.boolean().default(true),
    storybook: z
  .strictObject({
        command: z.string(),
        readyUrl: z.string().url(),
        reuseExisting: z.boolean().default(true),
        timeoutMs: z.number().int().positive().default(60_000)
      })
      .optional(),
    portal: z
  .strictObject({
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

const PopplerConfigSchema = z.strictObject({
  mode: z.enum(['optional', 'required']).default('optional'),
  dpi: z.number().int().positive().default(144)
});

const PrintRenderedPageSchema = z.strictObject({
  id: z.string().min(1),
  page: z.number().int().positive(),
  baseline: z.string().min(1),
  baselineRoot: z.string().optional(),
  threshold: VisualThresholdSchema.optional(),
  blocking: z.boolean().optional(),
  strict: z.boolean().optional()
});

const PrintCaseSchema = z.strictObject({
  id: z.string().min(1),
  route: z.string().min(1),
  viewport: z.string().min(1).default('desktop'),
  pdf: z.strictObject({
    format: z.string().min(1).default('A4'),
    printBackground: z.boolean().default(true),
    expectedPageCount: z.number().int().positive().optional(),
    expectedPageSize: z.enum(['A4']).optional(),
    poppler: PopplerConfigSchema.default({ mode: 'optional', dpi: 144 }),
    renderedPages: z.array(PrintRenderedPageSchema).default([])
  }),
  scenario: z.string().min(1).optional(),
  blocking: z.boolean().default(true)
});

const PrintContractSchema = z.strictObject({
  enabled: z.boolean().default(true),
  cases: z.array(PrintCaseSchema).default([])
});

const ReflectionConfigSchema = z.strictObject({
  project: z.string().min(1),
  run: z
  .strictObject({
      defaultMode: z.enum(runModes).default('smoke'),
      ciMode: z.enum(runModes).default('smoke')
    })
    .default({ defaultMode: 'smoke', ciMode: 'smoke' }),
  contracts: z.strictObject({
      browser: BrowserContractSchema.optional(),
      design: DesignContractSchema.optional(),
      component: ComponentContractSchema.optional(),
      print: PrintContractSchema.optional(),
      visual: z.unknown().optional()
  }),
  lifecycle: z
  .strictObject({
      beforeRun: z.array(LifecycleHookSchema).default([])
    })
    .default({ beforeRun: [] })
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
