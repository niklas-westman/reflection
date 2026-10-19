import { CommanderError } from 'commander';
import { availableParallelism } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { runBrowserContract } from '../contracts/browser/browser-contract.js';
import { runComponentVisualContractWithBrowser } from '../contracts/component/component-visual-contract.js';
import { runDesignContract } from '../contracts/design/design-contract.js';
import { runPrintContract } from '../contracts/print/print-contract.js';
import { runBeforeRunHooks } from '../contracts/setup/lifecycle.js';
import { createArtifactStore } from '../core/artifact-store.js';
import { isRunMode, loadReflectionConfig, type ReflectionConfig, type RunMode } from '../core/config.js';
import { describeOperatingSystem, getPlaywrightVersion, getReflectionVersion } from '../core/environment.js';
import { hashReportInputs, listCaseBaselineFiles } from '../core/input-hashing.js';
import { ExitCode } from '../core/exit-codes.js';
import { createRunManifest } from '../core/manifest.js';
import { createReport, deriveExitCode, type CheckResult } from '../core/report-schema.js';
import { writeReports } from '../core/report-writer.js';
import { applyRunFilter, countRunnableTargets, hasRunFilter } from '../core/run-filter.js';
import { startManagedServer, type ManagedServer } from '../core/server-manager.js';

export type RunCommandOptions = {
  config?: string;
  mode: string;
  ci?: boolean;
  reportDir?: string;
  workers?: string | number | boolean;
  route?: string[];
  state?: string[];
  case?: string[];
};

export function parseRunMode(value: string): RunMode {
  if (!isRunMode(value)) {
    throw new CommanderError(
      ExitCode.InvalidUsage,
      'reflection.invalidMode',
      `Invalid mode "${value}". Expected one of: smoke, design, visual, print, full.`
    );
  }

  return value;
}

export async function runCommand(options: RunCommandOptions): Promise<void> {
  let mode: RunMode;
  try {
    mode = parseRunMode(options.mode);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    throw error;
  }

  let config: ReflectionConfig | undefined;
  if (options.config) {
    try {
      config = await loadReflectionConfig(options.config);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(message);
      throw new CommanderError(ExitCode.ToolOrConfigError, 'reflection.config', message);
    }
  }

  const runFilter = { routes: options.route ?? [], states: options.state ?? [], cases: options.case ?? [] };
  if (hasRunFilter(runFilter)) {
    if (!config) {
      const message = 'Run filters (--route, --state, --case) require --config.';
      console.error(message);
      throw new CommanderError(ExitCode.InvalidUsage, 'reflection.filter', message);
    }

    const filtered = applyRunFilter(config, runFilter);
    for (const [kind, ids] of Object.entries(filtered.unmatched)) {
      for (const id of ids) {
        console.error(`Warning: no ${kind.slice(0, -1)} named "${id}" in the config.`);
      }
    }

    if (countRunnableTargets(filtered.config, mode) === 0) {
      const message = 'No targets matched the --route/--state/--case filters for this mode; nothing was run.';
      console.error(message);
      throw new CommanderError(ExitCode.FilterMatchedNothing, 'reflection.filter', message);
    }
    config = filtered.config;
  }

  const startedAt = new Date();
  const runId = createRunId(startedAt);
  const ci = options.ci === true;
  const rootDir = options.reportDir ?? (ci ? 'artifacts/reflection' : '.reflection');
  let workers: number;
  try {
    workers = resolveWorkerCount(options.workers, ci);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    throw error;
  }
  const configDir = options.config ? dirname(resolve(options.config)) : process.cwd();
  const store = await createArtifactStore({ rootDir, runId });
  const checks: CheckResult[] = [];
  let server: ManagedServer | undefined;
  let browserIdentity: { name: string; version: string } | undefined;
  let inputs: Awaited<ReturnType<typeof hashReportInputs>> | undefined;

  try {
    const browserConfig = config?.contracts.browser;
    const designConfig = config?.contracts.design;
    const componentConfig = config?.contracts.component;
    const printConfig = config?.contracts.print;
    const shouldRunBrowser = (mode === 'smoke' || mode === 'full') && browserConfig?.enabled !== false && browserConfig !== undefined;
    const shouldRunDesign = (mode === 'design' || mode === 'full') && designConfig?.enabled !== false && designConfig !== undefined;
    const shouldRunComponent = (mode === 'visual' || mode === 'full') && componentConfig?.enabled !== false && componentConfig !== undefined;
    const shouldRunPrint = (mode === 'smoke' || mode === 'print' || mode === 'full') && printConfig?.enabled !== false && printConfig !== undefined;

    if (config?.lifecycle.beforeRun && config.lifecycle.beforeRun.length > 0) {
      checks.push(...(await runBeforeRunHooks({ hooks: config.lifecycle.beforeRun, store, cwd: process.cwd() })));
    }

    // Inputs are hashed after the setup hooks, because a hook may generate a file the run depends on (a design
    // snapshot, a fixture), and before any contract runs, so the hashes are what the contracts will read.
    if (config) {
      try {
        inputs = await hashReportInputs({
          configDir,
          ...(options.config ? { configFile: resolve(options.config) } : {}),
          declared: config.inputs,
          baselineFiles: listCaseBaselineFiles(config, mode)
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(message);
        throw new CommanderError(ExitCode.ToolOrConfigError, 'reflection.inputs', message);
      }
    }

    const hasBlockingSetupFailure = checks.some(
      (check) => check.suite === 'setup' && check.severity === 'blocking' && (check.status === 'fail' || check.status === 'error')
    );

    if (!hasBlockingSetupFailure && (shouldRunBrowser || shouldRunPrint)) {
      if (!browserConfig) {
        checks.push({
          id: `environment.${mode}.browser-config`,
          suite: 'environment',
          target: mode,
          status: 'fail',
          severity: 'blocking',
          summary: 'A browser contract is required when running print contracts.',
          artifacts: [],
          metadata: { classification: 'missing-browser-config' },
          suggestedNextStep: 'Configure contracts.browser with baseUrl, routes, and server settings before enabling contracts.print.'
        });
      }
    }

    const canRunDownstream = !hasBlockingSetupFailure && !checks.some((check) => check.id === `environment.${mode}.browser-config`);

    if (canRunDownstream && (shouldRunBrowser || shouldRunPrint) && browserConfig?.server) {
      server = await startManagedServer(browserConfig.server, {
        cwd: process.cwd(),
        logPath: store.resolveRunPath('server/app.log')
      });
    }

    if (canRunDownstream && shouldRunBrowser && browserConfig) {
      checks.push(await createEnvironmentCheck(mode, server));

      const browserResult = await runBrowserContract({ ...browserConfig, configDir }, store);
      checks.push(...browserResult.checks);
      browserIdentity = browserResult.browser;
    }

    if (canRunDownstream && shouldRunDesign) {
      checks.push(...(await runDesignContract(designConfig, store)));
    }

    if (canRunDownstream && shouldRunComponent) {
      const componentRun = await runComponentVisualContractWithBrowser({ ...componentConfig, configDir }, store);
      checks.push(...componentRun.checks);
      browserIdentity ??= componentRun.browser;
    }

    if (canRunDownstream && shouldRunPrint && printConfig && browserConfig) {
      if (!shouldRunBrowser && browserConfig.server) {
        checks.push(await createEnvironmentCheck(mode, server));
      }
      checks.push(
        ...(await runPrintContract({
          config: printConfig,
          browser: { baseUrl: browserConfig.baseUrl, routes: browserConfig.routes },
          store
        }))
      );
    }

    if (!shouldRunBrowser && !shouldRunDesign && !shouldRunComponent && !shouldRunPrint && checks.length === 0) {
      checks.push(...createPhasePlaceholderChecks(mode));
    }
  } finally {
    await server?.stop();
  }

  const finishedAt = new Date();
  const report = createReport({
    runId,
    project: config?.project ?? basename(process.cwd()),
    startedAt,
    finishedAt,
    mode,
    ci,
    environment: {
      profile: ci ? 'ci' : 'local',
      platform: process.platform,
      nodeVersion: process.version,
      workers,
      reflectionVersion: getReflectionVersion(),
      playwrightVersion: getPlaywrightVersion(),
      os: describeOperatingSystem(),
      ...(browserIdentity ? { browser: browserIdentity } : {}),
      ...(hasRunFilter(runFilter) ? { filter: runFilter } : {})
    },
    checks,
    ...(inputs ? { inputs } : {}),
    ...(config?.meta ? { meta: config.meta } : {})
  });
  const reportArtifacts = await writeReports(store, report);
  const manifest = createRunManifest({ report: { ...report, artifacts: reportArtifacts }, files: reportArtifacts });
  await store.writeJson('manifest.json', manifest);

  console.log('Reflection');
  console.log('');
  for (const check of checks) {
    const icon = check.status === 'pass' ? '✓' : check.status === 'fail' ? '✕' : check.status === 'warn' ? '⚠' : '-';
    console.log(`${icon} ${check.id}`);
  }
  console.log('');
  console.log(`Status: ${report.status}`);
  console.log(`Report: ${join(rootDir, 'runs', runId, 'report.md')}`);

  const exitCode = deriveExitCode(report.status);
  if (exitCode !== ExitCode.Success) {
    throw new CommanderError(exitCode, 'reflection.run', `Reflection finished with status: ${report.status}`);
  }
}

function createRunId(date: Date): string {
  const stamp = date.toISOString().replaceAll(':', '-').replace(/\.\d{3}Z$/, 'Z');
  return `${stamp}-local`;
}

function resolveWorkerCount(value: string | number | boolean | undefined, ci: boolean): number {
  if (value === undefined) {
    return ci ? 1 : Math.max(1, Math.min(4, availableParallelism()));
  }

  if (value === true || value === false) {
    throw new CommanderError(ExitCode.InvalidUsage, 'reflection.invalidWorkers', `Invalid workers "${String(value)}". Expected a positive integer.`);
  }

  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || (typeof value === 'string' && !/^[1-9]\d*$/.test(value))) {
    throw new CommanderError(ExitCode.InvalidUsage, 'reflection.invalidWorkers', `Invalid workers "${value}". Expected a positive integer.`);
  }

  return parsed;
}

async function createEnvironmentCheck(mode: RunMode, server: ManagedServer | undefined): Promise<CheckResult> {
  return {
    id: `environment.${mode}.server`,
    suite: 'environment',
    target: server?.readyUrl ?? 'external-browser-target',
    status: 'pass',
    severity: 'info',
    summary: server ? `Browser target server ready at ${server.readyUrl}.` : 'Browser target uses configured base URL without managed server.',
    artifacts: [],
    metadata: {
      serverStarted: server?.started ?? false,
      serverReused: server?.reused ?? false,
      pid: server?.pid
    }
  };
}

function createPhasePlaceholderChecks(mode: RunMode): CheckResult[] {
  return [
    {
      id: `environment.${mode}.phase-placeholder`,
      suite: 'environment',
      target: mode,
      status: 'pass',
      severity: 'info',
      summary: 'Phase 1.2 artifact/report pipeline is available; real contract runners come next.',
      artifacts: [],
      metadata: {}
    }
  ];
}
