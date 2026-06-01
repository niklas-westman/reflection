import { lstat, readdir, readFile, realpath, rm } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import { z } from 'zod';

const RunManifestSchema = z.object({
  schemaVersion: z.literal(1),
  runId: z.string().min(1),
  createdAt: z.string().datetime(),
  project: z.string().min(1),
  status: z.enum(['pass', 'fail', 'pass-with-review', 'error']),
  mode: z.enum(['smoke', 'design', 'visual', 'full']),
  ci: z.boolean(),
  retention: z.object({ pinned: z.boolean() }),
  files: z.array(
    z.object({
      path: z.string().min(1),
      type: z.enum(['report', 'screenshot', 'image', 'visual-diff', 'trace', 'video', 'log', 'metadata']),
      bytes: z.number().int().nonnegative().optional(),
      sha256: z.string().regex(/^[a-f0-9]{64}$/).optional()
    })
  )
});

export type GcRun = {
  runId: string;
  path: string;
};

export type GcSkippedRun = GcRun & {
  reason: string;
};

export type GcPlan = {
  reportDir: string;
  runsDir: string;
  dryRun: boolean;
  eligible: GcRun[];
  skipped: GcSkippedRun[];
  deleted: GcRun[];
};

export async function collectGarbage(options: { reportDir?: string; dryRun?: boolean } = {}): Promise<GcPlan> {
  const reportDir = resolve(options.reportDir ?? '.reflection');
  const runsDir = resolve(reportDir, 'runs');
  ensureInside(reportDir, runsDir);
  const dryRun = options.dryRun !== false;

  const plan: GcPlan = { reportDir, runsDir, dryRun, eligible: [], skipped: [], deleted: [] };
  const realReportDir = await realpath(reportDir);
  const realRunsDir = await inspectRunsDirectory(runsDir, realReportDir);
  if (realRunsDir === undefined) {
    return plan;
  }

  let entries: Array<{ name: string }>;
  try {
    entries = await readdir(runsDir, { withFileTypes: true });
  } catch (error) {
    if (isNodeError(error, 'ENOENT')) {
      return plan;
    }
    throw error;
  }

  for (const entry of entries) {
    if (entry.name === 'latest') {
      continue;
    }

    const runDir = resolve(runsDir, entry.name);
    ensureInside(runsDir, runDir);

    const entryStats = await lstat(runDir);
    if (!entryStats.isDirectory() && !entryStats.isSymbolicLink()) {
      plan.skipped.push({ runId: entry.name, path: runDir, reason: 'not a run directory' });
      continue;
    }

    const safetyIssue = await getRunSafetyIssue({ realRunsDir, runDir });
    if (safetyIssue) {
      plan.skipped.push({ runId: entry.name, path: runDir, reason: safetyIssue });
      continue;
    }

    const manifestResult = await readRunManifest(runDir);
    if (!manifestResult.ok) {
      plan.skipped.push({ runId: entry.name, path: runDir, reason: manifestResult.reason });
      continue;
    }

    if (manifestResult.manifest.runId !== entry.name) {
      plan.skipped.push({ runId: entry.name, path: runDir, reason: `manifest runId mismatch: ${manifestResult.manifest.runId}` });
      continue;
    }

    if (manifestResult.manifest.retention.pinned) {
      plan.skipped.push({ runId: entry.name, path: runDir, reason: 'run is pinned' });
      continue;
    }

    plan.eligible.push({ runId: entry.name, path: runDir });
  }

  if (!dryRun) {
    for (const run of plan.eligible) {
      const safetyIssue = await getRunSafetyIssue({ realRunsDir, runDir: run.path });
      if (safetyIssue) {
        plan.skipped.push({ ...run, reason: `became unsafe before deletion: ${safetyIssue}` });
        continue;
      }
      await rm(run.path, { recursive: true, force: false });
      plan.deleted.push(run);
    }
  }

  return plan;
}

async function inspectRunsDirectory(runsDir: string, realReportDir: string): Promise<string | undefined> {
  try {
    const stats = await lstat(runsDir);
    if (stats.isSymbolicLink()) {
      throw new Error(`Refusing to garbage collect through a symlinked runs directory: ${runsDir}`);
    }
    if (!stats.isDirectory()) {
      throw new Error(`Reflection runs path is not a directory: ${runsDir}`);
    }
  } catch (error) {
    if (isNodeError(error, 'ENOENT')) {
      return undefined;
    }
    throw error;
  }

  const realRunsDir = await realpath(runsDir);
  if (!isInside(realReportDir, realRunsDir)) {
    throw new Error(`Reflection runs directory resolves outside the artifact root: ${realRunsDir}`);
  }

  return realRunsDir;
}

async function getRunSafetyIssue(input: { realRunsDir: string; runDir: string }): Promise<string | undefined> {
  try {
    const stats = await lstat(input.runDir);
    if (stats.isSymbolicLink()) {
      const realRunDir = await realpath(input.runDir);
      if (!isInside(input.realRunsDir, realRunDir)) {
        return `run directory resolves outside the runs directory: ${realRunDir}`;
      }
      return 'run directory is a symlink';
    }

    const realRunDir = await realpath(input.runDir);
    if (!isInside(input.realRunsDir, realRunDir)) {
      return `run directory resolves outside the runs directory: ${realRunDir}`;
    }
  } catch (error) {
    if (isNodeError(error, 'ENOENT')) {
      return 'run directory disappeared before GC could inspect it';
    }
    throw error;
  }

  return undefined;
}

async function readRunManifest(runDir: string): Promise<
  | { ok: true; manifest: z.output<typeof RunManifestSchema> }
  | { ok: false; reason: string }
> {
  try {
    const raw = await readFile(resolve(runDir, 'manifest.json'), 'utf8');
    const parsed = RunManifestSchema.safeParse(JSON.parse(raw) as unknown);
    if (!parsed.success) {
      return { ok: false, reason: `invalid manifest: ${parsed.error.issues.map((issue) => issue.path.join('.') || 'manifest').join(', ')}` };
    }
    return { ok: true, manifest: parsed.data };
  } catch (error) {
    if (isNodeError(error, 'ENOENT')) {
      return { ok: false, reason: 'missing manifest' };
    }
    if (error instanceof SyntaxError) {
      return { ok: false, reason: 'invalid manifest JSON' };
    }
    throw error;
  }
}

function ensureInside(parent: string, child: string): void {
  if (!isInside(parent, child)) {
    throw new Error(`Refusing to garbage collect outside the artifact root: ${child}`);
  }
}

function isInside(parent: string, child: string): boolean {
  const relation = relative(parent, child);
  return relation === '' || (!relation.startsWith('..') && !isAbsolute(relation));
}

function isNodeError(error: unknown, code: string): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error && error.code === code;
}
