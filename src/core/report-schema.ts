import { z } from 'zod';
import { ExitCode } from './exit-codes.js';
import type { RunMode } from './config.js';

export const CheckStatusSchema = z.enum(['pass', 'fail', 'warn', 'skipped', 'error']);
export const CheckSeveritySchema = z.enum(['blocking', 'review', 'info']);
export const CheckSuiteSchema = z.enum(['design', 'browser', 'visual', 'component', 'environment']);
export const ReportStatusSchema = z.enum(['pass', 'fail', 'pass-with-review', 'error']);
export const ArtifactTypeSchema = z.enum(['report', 'screenshot', 'image', 'visual-diff', 'trace', 'video', 'log', 'metadata']);
export const ArtifactRoleSchema = z.enum(['evidence', 'expected', 'actual', 'diff', 'trace', 'debug']);

export const ArtifactRefSchema = z.object({
  type: ArtifactTypeSchema,
  role: ArtifactRoleSchema.optional(),
  path: z.string().min(1),
  bytes: z.number().int().nonnegative().optional(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/).optional()
});

export const CheckResultSchema = z.object({
  id: z.string().min(1),
  suite: CheckSuiteSchema,
  target: z.string().min(1),
  status: CheckStatusSchema,
  severity: CheckSeveritySchema,
  summary: z.string().min(1),
  details: z.string().optional(),
  artifacts: z.array(ArtifactRefSchema),
  metadata: z.record(z.string(), z.unknown()),
  suggestedNextStep: z.string().optional()
});

export const SuggestedNextStepSchema = z.object({
  kind: z.string().min(1),
  summary: z.string().min(1)
});

export const ReportSummarySchema = z.object({
  passed: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  warnings: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  blockingFailures: z.number().int().nonnegative(),
  reviewItems: z.number().int().nonnegative()
});

export const ReflectionReportSchema = z.object({
  schemaVersion: z.literal(1),
  runId: z.string().min(1),
  project: z.string().min(1),
  startedAt: z.string().datetime(),
  finishedAt: z.string().datetime(),
  status: ReportStatusSchema,
  mode: z.enum(['smoke', 'design', 'visual', 'full']),
  ci: z.boolean(),
  environment: z.record(z.string(), z.unknown()),
  summary: ReportSummarySchema,
  checks: z.array(CheckResultSchema),
  artifacts: z.array(ArtifactRefSchema),
  suggestedNextSteps: z.array(SuggestedNextStepSchema)
});

export type CheckStatus = z.output<typeof CheckStatusSchema>;
export type CheckSeverity = z.output<typeof CheckSeveritySchema>;
export type CheckSuite = z.output<typeof CheckSuiteSchema>;
export type ReportStatus = z.output<typeof ReportStatusSchema>;
export type ArtifactRef = z.output<typeof ArtifactRefSchema>;
export type CheckResult = z.output<typeof CheckResultSchema>;
export type ReflectionReport = z.output<typeof ReflectionReportSchema>;
export type ReportSummary = z.output<typeof ReportSummarySchema>;
export type SuggestedNextStep = z.output<typeof SuggestedNextStepSchema>;

export function summarizeChecks(checks: CheckResult[]): ReportSummary {
  return {
    passed: checks.filter((check) => check.status === 'pass').length,
    failed: checks.filter((check) => check.status === 'fail').length,
    warnings: checks.filter((check) => check.status === 'warn').length,
    skipped: checks.filter((check) => check.status === 'skipped').length,
    blockingFailures: checks.filter(
      (check) => check.severity === 'blocking' && (check.status === 'fail' || check.status === 'error')
    ).length,
    reviewItems: checks.filter((check) => check.severity === 'review' && (check.status === 'warn' || check.status === 'fail')).length
  };
}

export function deriveReportStatus(checks: CheckResult[]): ReportStatus {
  if (checks.some((check) => check.status === 'error')) {
    return 'error';
  }

  if (checks.some((check) => check.severity === 'blocking' && check.status === 'fail')) {
    return 'fail';
  }

  if (checks.some((check) => check.severity === 'review' && (check.status === 'warn' || check.status === 'fail'))) {
    return 'pass-with-review';
  }

  return 'pass';
}

export function deriveExitCode(status: ReportStatus): ExitCode {
  if (status === 'fail') {
    return ExitCode.BlockingFailure;
  }

  if (status === 'error') {
    return ExitCode.ToolOrConfigError;
  }

  return ExitCode.Success;
}

export function deriveSuggestedNextSteps(checks: CheckResult[]): SuggestedNextStep[] {
  const blockingFailures = checks.filter(
    (check) => check.severity === 'blocking' && (check.status === 'fail' || check.status === 'error')
  );
  if (blockingFailures.length > 0) {
    return [
      {
        kind: 'fix',
        summary: `Fix blocking checks before updating baselines: ${formatCheckList(blockingFailures)}.`
      }
    ];
  }

  const missingBaselines = checks.filter(
    (check) => check.suite === 'visual' && check.severity === 'review' && check.metadata.classification === 'missing-baseline'
  );
  if (missingBaselines.length > 0) {
    return [
      {
        kind: 'baseline',
        summary:
          'Review actual screenshots for missing baselines, then run `reflection update --dry-run --case <caseId> --from-run latest` for intentional first baselines.'
      }
    ];
  }

  const visualReviewItems = checks.filter((check) => check.suite === 'visual' && check.severity === 'review' && (check.status === 'warn' || check.status === 'fail'));
  if (visualReviewItems.length > 0) {
    return [
      {
        kind: 'review',
        summary:
          'Inspect review-only visual artifacts, then run `reflection update --dry-run --case <caseId> --from-run latest` for intentional route visual changes.'
      }
    ];
  }

  const reviewItems = checks.filter((check) => check.severity === 'review' && (check.status === 'warn' || check.status === 'fail'));
  if (reviewItems.length > 0) {
    return [
      {
        kind: 'review',
        summary: `Inspect review-only checks: ${formatCheckList(reviewItems)}.`
      }
    ];
  }

  return [{ kind: 'pass', summary: 'No action required; expand route or visual coverage when useful.' }];
}

export function validateReport(report: unknown): ReflectionReport {
  const parsed = ReflectionReportSchema.safeParse(report);
  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => `${issue.path.join('.') || 'report'}: ${issue.message}`).join('; ');
    throw new Error(`Invalid Reflection report: ${details}`);
  }

  return parsed.data;
}

export function createReport(input: {
  runId: string;
  project: string;
  startedAt: Date;
  finishedAt: Date;
  mode: RunMode;
  ci: boolean;
  environment?: Record<string, unknown>;
  checks: CheckResult[];
  artifacts?: ArtifactRef[];
  suggestedNextSteps?: SuggestedNextStep[];
}): ReflectionReport {
  const status = deriveReportStatus(input.checks);
  return validateReport({
    schemaVersion: 1,
    runId: input.runId,
    project: input.project,
    startedAt: input.startedAt.toISOString(),
    finishedAt: input.finishedAt.toISOString(),
    status,
    mode: input.mode,
    ci: input.ci,
    environment: input.environment ?? {},
    summary: summarizeChecks(input.checks),
    checks: input.checks,
    artifacts: input.artifacts ?? [],
    suggestedNextSteps: input.suggestedNextSteps ?? deriveSuggestedNextSteps(input.checks)
  });
}

function formatCheckList(checks: CheckResult[]): string {
  const ids = checks.map((check) => check.id);
  if (ids.length <= 3) {
    return ids.join(', ');
  }

  return `${ids.slice(0, 3).join(', ')} and ${ids.length - 3} more`;
}
