import type { ArtifactStore } from './artifact-store.js';
import type { ArtifactRef, CheckResult, ReflectionReport } from './report-schema.js';

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
  lines.push(`Project: ${report.project}`);
  lines.push(`Run: ${report.runId}`);
  lines.push(`Mode: ${report.mode}`);
  lines.push(`Status: ${report.status}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- Passed: ${report.summary.passed}`);
  lines.push(`- Failed: ${report.summary.failed}`);
  lines.push(`- Warnings: ${report.summary.warnings}`);
  lines.push(`- Skipped: ${report.summary.skipped}`);
  lines.push(`- Blocking failures: ${report.summary.blockingFailures}`);
  lines.push(`- Review items: ${report.summary.reviewItems}`);

  const blocking = report.checks.filter(isBlockingFailure);
  if (blocking.length > 0) {
    lines.push('');
    lines.push('## Blocking failures');
    lines.push('');
    for (const check of blocking) {
      lines.push(renderCheckLine(check));
    }
  }

  const review = report.checks.filter(isReviewItem);
  if (review.length > 0) {
    lines.push('');
    lines.push('## Review items');
    lines.push('');
    for (const check of review) {
      lines.push(renderCheckLine(check));
    }
  }

  lines.push('');
  lines.push('## Checks');
  lines.push('');
  for (const check of report.checks) {
    lines.push(renderCheckLine(check));
    if (check.artifacts.length > 0) {
      for (const artifact of check.artifacts) {
        lines.push(`  - ${artifact.role ?? artifact.type}: ${artifact.path}`);
      }
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
  return `${lines.join('\n')}\n`;
}

function isBlockingFailure(check: CheckResult): boolean {
  return check.severity === 'blocking' && (check.status === 'fail' || check.status === 'error');
}

function isReviewItem(check: CheckResult): boolean {
  return check.severity === 'review' && (check.status === 'warn' || check.status === 'fail');
}

function renderCheckLine(check: CheckResult): string {
  return `- ${check.status.toUpperCase()} ${check.id}: ${check.summary}`;
}
