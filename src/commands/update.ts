import { copyFile, lstat, mkdir, readFile, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { CommanderError } from 'commander';
import { createBaselineStore } from '../core/baseline-store.js';
import { loadReflectionConfig, type ReflectionConfig } from '../core/config.js';
import { ExitCode } from '../core/exit-codes.js';
import { validateReport, type CheckResult, type ReflectionReport } from '../core/report-schema.js';

export type UpdateCommandOptions = {
  config?: string;
  reportDir?: string;
  fromRun?: string;
  route?: string;
  case?: string;
  all?: boolean;
  dryRun?: boolean;
  ci?: boolean;
};

type UpdatePlanItem = {
  checkId: string;
  caseId: string;
  routeId: string;
  sourcePath: string;
  baselineRoot: string;
  baselinePath: string;
};

export async function updateCommand(options: UpdateCommandOptions = {}): Promise<void> {
  try {
    if (options.ci === true || isTruthyCi(process.env.CI)) {
      throw new CommanderError(ExitCode.ToolOrConfigError, 'reflection.update', 'Reflection update refuses to mutate baselines in CI mode.');
    }

    if (!options.route && !options.case && options.all !== true) {
      throw new CommanderError(ExitCode.InvalidUsage, 'reflection.update', 'Specify --route, --case, or --all before updating baselines.');
    }

    if (options.all === true && (options.route || options.case)) {
      throw new CommanderError(ExitCode.InvalidUsage, 'reflection.update', 'Use --all by itself, or target a specific --route/--case.');
    }

    const config = await loadReflectionConfig(options.config ?? 'reflection.config.ts');
    const reportRoot = resolve(options.reportDir ?? '.reflection');
    const runsDir = resolve(reportRoot, 'runs');
    const runId = options.fromRun === undefined || options.fromRun === 'latest' ? await readLatestRunId(reportRoot) : options.fromRun;
    assertSafeRunId(runId);
    const runDir = resolve(runsDir, runId);
    ensureInside(runsDir, runDir);
    await ensureRealPathInside(runsDir, runDir);
    const reportPath = resolve(runDir, 'report.json');
    ensureInside(runDir, reportPath);
    await ensureRealPathInside(runDir, reportPath);
    const report = validateReport(JSON.parse(await readFile(reportPath, 'utf8')) as unknown);
    if (report.runId !== runId) {
      throw new Error(`Report run id mismatch: expected ${runId}, found ${report.runId}`);
    }

    const plan = await createUpdatePlan({ config, report, runDir, route: options.route, caseId: options.case, all: options.all === true });
    if (plan.length === 0) {
      throw new Error('No matching visual baseline updates found for the selected target.');
    }

    for (const item of plan) {
      if (options.dryRun !== true) {
        await ensureBaselineDestinationInside(item.baselineRoot, item.baselinePath);
        await mkdir(dirname(item.baselinePath), { recursive: true });
        await copyFile(item.sourcePath, item.baselinePath);
      }
    }

    console.log(renderUpdateSummary(plan, options.dryRun === true));
  } catch (error) {
    if (error instanceof CommanderError) {
      throw error;
    }

    const message = error instanceof Error ? error.message : String(error);
    throw new CommanderError(ExitCode.ToolOrConfigError, 'reflection.update', message);
  }
}

async function createUpdatePlan(input: {
  config: ReflectionConfig;
  report: ReflectionReport;
  runDir: string;
  route?: string | undefined;
  caseId?: string | undefined;
  all: boolean;
}): Promise<UpdatePlanItem[]> {
  const visualCases = input.config.contracts.browser?.visualSmoke ?? [];
  const selectedCases = visualCases.filter((visualCase) => {
    if (input.all) {
      return true;
    }

    if (input.caseId && visualCase.id !== input.caseId) {
      return false;
    }

    if (input.route && visualCase.route !== input.route) {
      return false;
    }

    return true;
  });

  const plan: UpdatePlanItem[] = [];

  for (const visualCase of selectedCases) {
    const check = findVisualCheck(input.report, visualCase.id);
    const actualArtifact = check.artifacts.find((artifact) => artifact.role === 'actual' && artifact.path.endsWith('.png'));
    if (!actualArtifact) {
      throw new Error(`Visual check ${check.id} has no actual PNG artifact to promote.`);
    }

    const sourcePath = resolve(input.runDir, actualArtifact.path);
    ensureInside(input.runDir, sourcePath);
    await ensureRealPathInside(input.runDir, sourcePath);
    const baselineStore = createBaselineStore(visualCase.baselineRoot ? { rootDir: visualCase.baselineRoot } : {});

    plan.push({
      checkId: check.id,
      caseId: visualCase.id,
      routeId: visualCase.route,
      sourcePath,
      baselineRoot: baselineStore.rootDir,
      baselinePath: baselineStore.resolveBaselinePath(visualCase.baseline)
    });
  }

  return plan;
}

function findVisualCheck(report: ReflectionReport, caseId: string): CheckResult {
  const check = report.checks.find((candidate) => candidate.id === `visual.${caseId}` && candidate.suite === 'visual');
  if (!check) {
    throw new Error(`No visual check found in report for case ${caseId}.`);
  }

  return check;
}

async function readLatestRunId(rootDir: string): Promise<string> {
  const latestPath = resolve(rootDir, 'runs', 'latest');
  const runsDir = resolve(rootDir, 'runs');
  ensureInside(runsDir, latestPath);
  await ensureRealPathInside(runsDir, latestPath);
  const value = (await readFile(latestPath, 'utf8')).trim();
  if (value.length === 0) {
    throw new Error(`Latest Reflection run pointer is empty: ${latestPath}`);
  }
  return value;
}

function renderUpdateSummary(plan: UpdatePlanItem[], dryRun: boolean): string {
  const lines = ['Reflection update', '', `Dry run: ${dryRun ? 'yes' : 'no'}`, ''];
  lines.push(dryRun ? 'Would update:' : 'Updated:');
  for (const item of plan) {
    lines.push(`- ${item.checkId}: ${relative(process.cwd(), item.sourcePath)} -> ${relative(process.cwd(), item.baselinePath)}`);
  }
  return lines.join('\n');
}

function assertSafeRunId(runId: string): void {
  if (!/^[A-Za-z0-9._:-]+$/.test(runId) || isAbsolute(runId) || runId.split(/[\\/]/).includes('..')) {
    throw new Error(`Invalid Reflection run id: ${runId}`);
  }
}

function isTruthyCi(value: string | undefined): boolean {
  return value !== undefined && value !== '' && value !== 'false' && value !== '0';
}

async function ensureBaselineDestinationInside(baselineRoot: string, baselinePath: string): Promise<void> {
  ensureInside(baselineRoot, baselinePath);
  const realRoot = await realpath(baselineRoot);
  await ensureDirectoryInsideBaselineRoot(baselineRoot, dirname(baselinePath), realRoot);

  try {
    const stats = await lstat(baselinePath);
    if (stats.isSymbolicLink()) {
      throw new Error(`Refusing to overwrite symlinked baseline path: ${baselinePath}`);
    }

    const realDestination = await realpath(baselinePath);
    ensureInside(realRoot, realDestination);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return;
    }

    throw error;
  }
}

async function ensureDirectoryInsideBaselineRoot(baselineRoot: string, directoryPath: string, realRoot: string): Promise<void> {
  ensureInside(baselineRoot, directoryPath);
  const relativeDirectory = relative(baselineRoot, directoryPath);
  if (relativeDirectory === '') {
    return;
  }

  let current = baselineRoot;
  for (const segment of relativeDirectory.split(/[\\/]+/).filter(Boolean)) {
    current = resolve(current, segment);
    try {
      const stats = await lstat(current);
      if (stats.isSymbolicLink()) {
        throw new Error(`Refusing to create baseline directory through symlink: ${current}`);
      }
      if (!stats.isDirectory()) {
        throw new Error(`Refusing to create baseline directory through non-directory path: ${current}`);
      }
      ensureInside(realRoot, await realpath(current));
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        await mkdir(current);
        ensureInside(realRoot, await realpath(current));
        continue;
      }

      throw error;
    }
  }
}

async function ensureRealPathInside(parent: string, child: string): Promise<void> {
  const [realParent, realChild] = await Promise.all([realpath(parent), realpath(child)]);
  ensureInside(realParent, realChild);
}

function ensureInside(parent: string, child: string): void {
  const relation = relative(parent, child);
  if (relation.startsWith('..') || isAbsolute(relation)) {
    throw new Error(`Refusing to update baselines using a path outside the expected directory: ${child}`);
  }
}
