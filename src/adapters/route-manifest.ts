import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import type { BrowserRouteTarget, TargetIR } from '../core/target-ir.js';

const RouteManifestExpectationSchema = z.union([
  z.object({ urlIncludes: z.string() }).strict(),
  z.object({ urlEquals: z.string() }).strict(),
  z.object({ role: z.string(), name: z.string().optional() }).strict(),
  z.object({ label: z.string() }).strict(),
  z.object({ text: z.string() }).strict(),
  z.object({ noText: z.string() }).strict(),
  z.object({ selector: z.string() }).strict(),
  z.object({ elementVisible: z.string() }).strict(),
  z.object({ elementNotVisible: z.string() }).strict(),
  z.object({ noHorizontalOverflow: z.literal(true) }).strict(),
  z.object({ noConsoleErrors: z.literal(true) }).strict(),
  z.object({ screenshot: z.string() }).strict()
]);

const RouteManifestRouteSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1).optional(),
    path: z.string().min(1),
    viewports: z.array(z.string().min(1)).default(['desktop']),
    expects: z.array(RouteManifestExpectationSchema).default([]),
    blocking: z.boolean().optional()
  })
  .strict();

const RouteManifestSchema = z
  .object({
    project: z.string().min(1),
    baseUrl: z.string().url(),
    maskSelectors: z.array(z.string().min(1)).default([]),
    routes: z.array(RouteManifestRouteSchema).default([])
  })
  .strict()
  .superRefine((manifest, context) => {
    const seen = new Set<string>();
    for (const [index, route] of manifest.routes.entries()) {
      if (seen.has(route.id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['routes', index, 'id'],
          message: `duplicate route id "${route.id}"`
        });
      }
      seen.add(route.id);
    }
  });

type RouteManifest = z.output<typeof RouteManifestSchema>;

export async function loadRouteManifestTargets(manifestPath: string): Promise<TargetIR> {
  let raw: string;
  try {
    raw = await readFile(manifestPath, 'utf8');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Route manifest not found: ${manifestPath}: ${message}`);
  }

  try {
    return parseRouteManifestTargets(JSON.parse(raw));
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid route manifest JSON: ${manifestPath}: ${error.message}`);
    }
    throw error;
  }
}

export function parseRouteManifestTargets(input: unknown): TargetIR {
  const manifest = parseRouteManifest(input);
  return {
    project: manifest.project,
    targets: manifest.routes.map((route): BrowserRouteTarget => ({
      id: route.id,
      family: 'browser-route',
      source: 'adapter',
      runModes: ['smoke', 'full'],
      blocking: route.blocking ?? true,
      route: {
        path: route.path,
        ...(route.name !== undefined ? { name: route.name } : {}),
        viewports: route.viewports,
        expects: route.expects
      },
      browser: {
        baseUrl: manifest.baseUrl,
        maskSelectors: manifest.maskSelectors
      }
    }))
  };
}

function parseRouteManifest(input: unknown): RouteManifest {
  const parsed = RouteManifestSchema.safeParse(input);
  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => `${issue.path.join('.') || 'manifest'}: ${issue.message}`).join('; ');
    throw new Error(`Invalid route manifest: ${details}`);
  }
  return parsed.data;
}
