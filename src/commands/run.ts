import { CommanderError } from 'commander';
import { availableParallelism } from 'node:os';
import { basename, join } from 'node:path';
import { runBrowserContract } from '../contracts/browser/browser-contract.js';
import { runComponentVisualContract } from '../contracts/component/component-visual-contract.js';
import { runDesignContract } from '../contracts/design/design-contract.js';
import { createArtifactStore } from '../core/artifact-store.js';
import { isRunMode, loadReflectionConfig, type ReflectionConfig, type RunMode } from '../core/config.js';
import { ExitCode } from '../core/exit-codes.js';
import { createRunManifest } from '../core/manifest.js';
import { createReport, deriveExitCode, type CheckResult } from '../core/report-schema.js';
import { writeReports } from '../core/report-writer.js';
import { startManagedServer, type ManagedServer } from '../core/server-manager.js';

export type RunCommandOptions = {
  config?: string;
  mode: string;
  ci?: boolean;
  reportDir?: string;
  workers?: string | number | boolean;
};

export function parseRunMode(value: string): RunMode {
  if (!isRunMode(value)) {
    throw new CommanderError(
      ExitCode.InvalidUsage,
      'reflection.invalidMode',
      `Invalid mode "${value}". Expected one of: smoke, design, visual, full.`
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
  const store = await createArtifactStore({ rootDir, runId });
  const checks: CheckResult[] = [];
  let server: ManagedServer | undefined;

  try {
    const browserConfig = config?.contracts.browser;
    const designConfig = config?.contracts.design;
    const componentConfig = config?.contracts.component;
    const shouldRunBrowser = (mode === 'smoke' || mode === 'full') && browserConfig?.enabled !== false && browserConfig !== undefined;
    const shouldRunDesign = (mode === 'design' || mode === 'full') && designConfig?.enabled !== false && designConfig !== undefined;
    const shouldRunComponent = (mode === 'visual' || mode === 'full') && componentConfig?.enabled !== false && componentConfig !== undefined;

    if (shouldRunBrowser) {
      if (browserConfig.server) {
        server = await startManagedServer(browserConfig.server, {
          cwd: process.cwd(),
          logPath: store.resolveRunPath('server/app.log')
        });
      }

      checks.push(await createEnvironmentCheck(mode, server));
      checks.push(...(await runBrowserContract(browserConfig, store)));
    }

    if (shouldRunDesign) {
      checks.push(...(await runDesignContract(designConfig, store)));
    }

    if (shouldRunComponent) {
      checks.push(...(await runComponentVisualContract(componentConfig, store)));
    }

    if (!shouldRunBrowser && !shouldRunDesign && !shouldRunComponent) {
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
      workers
    },
    checks
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
