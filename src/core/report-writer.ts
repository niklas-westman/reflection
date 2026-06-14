import type { ArtifactStore } from './artifact-store.js';
import type { ArtifactRef, CheckResult, CheckStatus, CheckSuite, ReflectionReport } from './report-schema.js';

export async function writeReports(store: ArtifactStore, report: ReflectionReport): Promise<ArtifactRef[]> {
  await store.ensureRunDir();
  const reportJson = await store.writeJson('report.json', report);
  const reportMd = await store.writeText('report.md', renderMarkdownReport(report));
  await store.updateLatestPointer();

  return [
    { ...reportJson, type: 'report', role: 'evidence' },
    { ...reportMd, type: 'report', role: 'evidence' }
  ];
}

export function renderMarkdownReport(report: ReflectionReport): string {
  const lines: string[] = [];
  lines.push('# Reflection Report');
  lines.push('');
  lines.push(`Full machine report: [report.json](report.json)`);
  lines.push('');
  lines.push(`- Project: ${report.project}`);
  lines.push(`- Run: ${report.runId}`);
  lines.push(`- Mode: ${report.mode}`);
  lines.push(`- Status: ${report.status}`);
  lines.push(`- Started: ${report.startedAt}`);
  lines.push(`- Finished: ${report.finishedAt}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push('| Metric | Count |');
  lines.push('| --- | ---: |');
  lines.push(`| Passed | ${report.summary.passed} |`);
  lines.push(`| Failed | ${report.summary.failed} |`);
  lines.push(`| Warnings | ${report.summary.warnings} |`);
  lines.push(`| Skipped | ${report.summary.skipped} |`);
  lines.push(`| Blocking failures | ${report.summary.blockingFailures} |`);
  lines.push(`| Review items | ${report.summary.reviewItems} |`);

  const suiteSummaries = summarizeBySuite(report.checks);
  if (suiteSummaries.length > 0) {
    lines.push('');
    lines.push('## Suites');
    lines.push('');
    lines.push('| Suite | Total | Pass | Warn | Fail | Error | Skipped |');
    lines.push('| --- | ---: | ---: | ---: | ---: | ---: | ---: |');
    for (const row of suiteSummaries) {
      lines.push(
        `| ${row.suite} | ${row.total} | ${row.pass} | ${row.warn} | ${row.fail} | ${row.error} | ${row.skipped} |`
      );
    }
  }

  const blocking = report.checks.filter(isBlockingFailure);
  const review = report.checks.filter(isReviewItem);
  lines.push('');
  lines.push('## Attention');
  lines.push('');
  if (blocking.length === 0 && review.length === 0) {
    lines.push('No blocking failures or review items.');
  } else {
    appendCheckSummary(lines, 'Blocking failures', blocking);
    appendCheckSummary(lines, 'Review items', review);
  }

  const visualBudget = summarizeVisualBudget(report.checks);
  if (visualBudget.length > 0) {
    lines.push('');
    lines.push('## Visual Budget Watch');
    lines.push('');
    lines.push('Highest threshold usage among visual checks.');
    lines.push('');
    lines.push('| Check | Status | Diff | Threshold | Budget used | Diagnostics |');
    lines.push('| --- | --- | ---: | ---: | ---: | --- |');
    for (const item of visualBudget) {
      lines.push(
        `| ${item.id} | ${item.status} | ${item.diff} | ${item.threshold} | ${item.budgetUsed} | ${item.diagnostics} |`
      );
    }
  }

  if (report.suggestedNextSteps.length > 0) {
    lines.push('');
    lines.push('## Suggested next steps');
    lines.push('');
    for (const step of report.suggestedNextSteps) {
      lines.push(`- ${step.summary}`);
    }
  }

  lines.push('');
  lines.push('Full check metadata, artifact paths, hashes, and diagnostics are in [report.json](report.json).');
  lines.push('');
  return `${lines.join('\n')}\n`;
}

function isBlockingFailure(check: CheckResult): boolean {
  return check.severity === 'blocking' && (check.status === 'fail' || check.status === 'error');
}

function isReviewItem(check: CheckResult): boolean {
  return check.severity === 'review' && (check.status === 'warn' || check.status === 'fail');
}

function renderCheckLine(check: CheckResult): string {
  const failureClass = check.failureClass ? ` [${check.failureClass}]` : '';
  return `- ${check.status.toUpperCase()} ${check.id}${failureClass}: ${check.summary}`;
}

function renderCheckDetails(check: CheckResult, options: { maxLines?: number } = {}): string[] {
  if (!check.details) {
    return [];
  }

  const lines = check.details.split('\n');
  const maxLines = options.maxLines ?? lines.length;
  const rendered = lines.slice(0, maxLines).map((line) => `  - ${line}`);
  if (lines.length > maxLines) {
    rendered.push(`  - ${lines.length - maxLines} more detail lines in report.json.`);
  }
  return rendered;
}

function appendCheckSummary(lines: string[], title: string, checks: CheckResult[]): void {
  if (checks.length === 0) {
    return;
  }

  lines.push(`### ${title}`);
  lines.push('');
  for (const check of checks.slice(0, 10)) {
    lines.push(renderCheckLine(check));
    lines.push(...renderCheckDetails(check, { maxLines: 2 }));
    if (check.suggestedNextStep) {
      lines.push(`  - Next: ${check.suggestedNextStep}`);
    }
    if (check.recommendations && check.recommendations.length > 0) {
      lines.push(`  - Recommendation: ${check.recommendations[0]}`);
    }
  }
  if (checks.length > 10) {
    lines.push(`- ${checks.length - 10} more ${title.toLowerCase()} in report.json.`);
  }
  lines.push('');
}

function summarizeBySuite(checks: CheckResult[]): Array<Record<CheckStatus, number> & { suite: CheckSuite; total: number }> {
  const rows = new Map<CheckSuite, Record<CheckStatus, number> & { suite: CheckSuite; total: number }>();
  for (const check of checks) {
    const row =
      rows.get(check.suite) ??
      ({
        suite: check.suite,
        total: 0,
        pass: 0,
        warn: 0,
        fail: 0,
        error: 0,
        skipped: 0
      } satisfies Record<CheckStatus, number> & { suite: CheckSuite; total: number });

    row.total += 1;
    row[check.status] += 1;
    rows.set(check.suite, row);
  }

  return [...rows.values()].sort((left, right) => left.suite.localeCompare(right.suite));
}

function summarizeVisualBudget(checks: CheckResult[]): Array<{
  id: string;
  status: CheckStatus;
  diff: string;
  threshold: string;
  budgetUsed: string;
  diagnostics: string;
}> {
  return checks
    .filter((check) => check.suite === 'visual')
    .map((check) => {
      const diffPixels = readNumber(check.metadata, 'diffPixels');
      const diffRatio = readNumber(check.metadata, 'diffRatio');
      const threshold = readRecord(check.metadata, 'threshold');
      const maxDiffPixels = threshold ? readNumber(threshold, 'maxDiffPixels') : undefined;
      const maxDiffPixelRatio = threshold ? readNumber(threshold, 'maxDiffPixelRatio') : undefined;
      const pixelBudget = diffPixels !== undefined && maxDiffPixels && maxDiffPixels > 0 ? diffPixels / maxDiffPixels : undefined;
      const ratioBudget =
        diffRatio !== undefined && maxDiffPixelRatio && maxDiffPixelRatio > 0 ? diffRatio / maxDiffPixelRatio : undefined;
      const budgetUsed = Math.max(pixelBudget ?? 0, ratioBudget ?? 0);
      const diagnostics = readDiagnosticsCategories(check.metadata);

      return {
        id: check.id,
        status: check.status,
        diff: formatDiff(diffPixels, diffRatio),
        threshold: formatDiff(maxDiffPixels, maxDiffPixelRatio),
        budgetUsed,
        diagnostics
      };
    })
    .filter((item) => item.budgetUsed > 0)
    .sort((left, right) => right.budgetUsed - left.budgetUsed)
    .slice(0, 5)
    .map((item) => ({
      ...item,
      budgetUsed: formatPercent(item.budgetUsed),
      diagnostics: item.diagnostics || 'n/a'
    }));
}

function readRecord(source: Record<string, unknown>, key: string): Record<string, unknown> | undefined {
  const value = source[key];
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function readNumber(source: Record<string, unknown>, key: string): number | undefined {
  const value = source[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function readDiagnosticsCategories(metadata: Record<string, unknown>): string {
  const diagnostics = readRecord(metadata, 'diagnostics');
  const categories = diagnostics?.categories;
  if (!Array.isArray(categories)) {
    return '';
  }

  return categories.filter((category): category is string => typeof category === 'string').join(', ');
}

function formatDiff(pixels?: number, ratio?: number): string {
  if (pixels === undefined && ratio === undefined) {
    return 'n/a';
  }

  if (pixels === undefined) {
    return formatPercent(ratio ?? 0);
  }

  if (ratio === undefined) {
    return `${pixels}px`;
  }

  return `${pixels}px / ${formatPercent(ratio)}`;
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}
