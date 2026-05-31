import { readFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import { CommanderError } from 'commander';
import { ExitCode } from '../core/exit-codes.js';
import { validateReport, type ArtifactRef, type CheckResult, type ReflectionReport } from '../core/report-schema.js';

export type ReviewCommandOptions = {
  reportDir?: string;
  latest?: boolean;
  run?: string;
  json?: boolean;
};

type ReviewSummary = {
  runId: string;
  project: string;
  status: ReflectionReport['status'];
  reportPath: string;
  blockingFailures: Array<Pick<CheckResult, 'id' | 'summary' | 'target' | 'status'>>;
  reviewItems: Array<Pick<CheckResult, 'id' | 'summary' | 'target' | 'status'>>;
  artifactPaths: string[];
  suggestedNextSteps: string[];
};

export async function reviewCommand(options: ReviewCommandOptions = {}): Promise<void> {
  try {
    if (options.latest === true && options.run !== undefined) {
      throw new Error('Use either --latest or --run, not both.');
    }

    const rootDir = resolve(options.reportDir ?? '.reflection');
    const runId = options.run ?? (await readLatestRunId(rootDir));
    assertSafeRunId(runId);
    const reportPath = resolve(rootDir, 'runs', runId, 'report.json');
    ensureInside(resolve(rootDir, 'runs'), reportPath);

    const report = validateReport(JSON.parse(await readFile(reportPath, 'utf8')) as unknown);
    const summary = createReviewSummary(report, reportPath);

    if (options.json === true) {
      console.log(JSON.stringify(summary, null, 2));
      return;
    }

    console.log(renderReview(summary));
  } catch (error) {
    if (error instanceof CommanderError) {
      throw error;
    }

    const message = error instanceof Error ? error.message : String(error);
    throw new CommanderError(ExitCode.ToolOrConfigError, 'reflection.review', message);
  }
}

async function readLatestRunId(rootDir: string): Promise<string> {
  const latestPath = resolve(rootDir, 'runs', 'latest');
  ensureInside(resolve(rootDir, 'runs'), latestPath);
  const value = (await readFile(latestPath, 'utf8')).trim();
  if (value.length === 0) {
    throw new Error(`Latest Reflection run pointer is empty: ${latestPath}`);
  }
  return value;
}

function createReviewSummary(report: ReflectionReport, reportPath: string): ReviewSummary {
  const blockingFailures = report.checks.filter(isBlockingFailure).map(toReviewCheck);
  const reviewItems = report.checks.filter(isReviewItem).map(toReviewCheck);

  return {
    runId: report.runId,
    project: report.project,
    status: report.status,
    reportPath,
    blockingFailures,
    reviewItems,
    artifactPaths: collectArtifactPaths(report),
    suggestedNextSteps: report.suggestedNextSteps.map((step) => step.summary)
  };
}

function renderReview(summary: ReviewSummary): string {
  const lines: string[] = [];
  lines.push('Reflection review');
  lines.push('');
  lines.push(`Project: ${summary.project}`);
  lines.push(`Run: ${summary.runId}`);
  lines.push(`Status: ${summary.status}`);
  lines.push(`Report: ${summary.reportPath}`);

  if (summary.blockingFailures.length > 0) {
    lines.push('');
    lines.push('Blocking:');
    for (const item of summary.blockingFailures) {
      lines.push(`- ${item.id} — ${item.summary}`);
    }
  }

  if (summary.reviewItems.length > 0) {
    lines.push('');
    lines.push('Review:');
    for (const item of summary.reviewItems) {
      lines.push(`- ${item.id} — ${item.summary}`);
    }
  }

  if (summary.artifactPaths.length > 0) {
    lines.push('');
    lines.push('Artifacts:');
    for (const artifactPath of summary.artifactPaths) {
      lines.push(`- ${artifactPath}`);
    }
  }

  if (summary.suggestedNextSteps.length > 0) {
    lines.push('');
    lines.push('Next:');
    for (const step of summary.suggestedNextSteps) {
      lines.push(`- ${step}`);
    }
  }

  return lines.join('\n');
}

function isBlockingFailure(check: CheckResult): boolean {
  return check.severity === 'blocking' && (check.status === 'fail' || check.status === 'error');
}

function isReviewItem(check: CheckResult): boolean {
  return check.severity === 'review' && (check.status === 'warn' || check.status === 'fail');
}

function toReviewCheck(check: CheckResult): Pick<CheckResult, 'id' | 'summary' | 'target' | 'status'> {
  return {
    id: check.id,
    summary: check.summary,
    target: check.target,
    status: check.status
  };
}

function collectArtifactPaths(report: ReflectionReport): string[] {
  const paths = new Set<string>();
  const addArtifact = (artifact: ArtifactRef) => paths.add(artifact.path);
  report.artifacts.forEach(addArtifact);
  report.checks.flatMap((check) => check.artifacts).forEach(addArtifact);
  return [...paths];
}

function assertSafeRunId(runId: string): void {
  if (!/^[A-Za-z0-9._:-]+$/.test(runId) || isAbsolute(runId) || runId.split(/[\\/]/).includes('..')) {
    throw new Error(`Invalid Reflection run id: ${runId}`);
  }
}

function ensureInside(parent: string, child: string): void {
  const relation = relative(parent, child);
  if (relation.startsWith('..') || isAbsolute(relation)) {
    throw new Error(`Refusing to read report outside Reflection runs directory: ${child}`);
  }
}
