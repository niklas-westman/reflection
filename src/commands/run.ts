import { CommanderError } from 'commander';
import { basename, join } from 'node:path';
import { createArtifactStore } from '../core/artifact-store.js';
import { isRunMode, loadReflectionConfig, type ReflectionConfig, type RunMode } from '../core/config.js';
import { ExitCode } from '../core/exit-codes.js';
import { createRunManifest } from '../core/manifest.js';
import { createReport, deriveExitCode, type CheckResult } from '../core/report-schema.js';
import { writeReports } from '../core/report-writer.js';

export type RunCommandOptions = {
  config?: string;
  mode: string;
  ci?: boolean;
  reportDir?: string;
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
  const finishedAt = new Date();
  const runId = createRunId(finishedAt);
  const rootDir = options.reportDir ?? (options.ci === true ? 'artifacts/reflection' : '.reflection');
  const store = await createArtifactStore({ rootDir, runId });
  const checks = createPhasePlaceholderChecks(mode);
  const report = createReport({
    runId,
    project: config?.project ?? basename(process.cwd()),
    startedAt,
    finishedAt,
    mode,
    ci: options.ci === true,
    environment: {
      profile: options.ci === true ? 'ci' : 'local',
      platform: process.platform,
      nodeVersion: process.version
    },
    checks,
    suggestedNextSteps: [{ kind: 'implementation', summary: 'Implement the next contract runner phase.' }]
  });
  const reportArtifacts = await writeReports(store, report);
  const manifest = createRunManifest({ report: { ...report, artifacts: reportArtifacts }, files: reportArtifacts });
  await store.writeJson('manifest.json', manifest);

  console.log('Reflection');
  console.log('');
  console.log(`✓ ${mode} placeholder`);
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
