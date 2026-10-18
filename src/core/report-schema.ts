import { z } from 'zod';
import { ExitCode } from './exit-codes.js';
import { computeResultHash } from './result-hash.js';
import type { RunMode } from './config.js';

export const CheckStatusSchema = z.enum(['pass', 'fail', 'warn', 'skipped', 'error']);
export const CheckSeveritySchema = z.enum(['blocking', 'review', 'info']);
export const CheckSuiteSchema = z.enum(['design', 'browser', 'visual', 'component', 'environment', 'setup', 'print']);
export const ReportStatusSchema = z.enum(['pass', 'fail', 'pass-with-review', 'error']);
export const ArtifactTypeSchema = z.enum([
  'report',
  'screenshot',
  'image',
  'visual-diff',
  'trace',
  'video',
  'log',
  'metadata',
  'html',
  'pdf',
  'document-page',
  'contact-sheet'
]);
export const ArtifactRoleSchema = z.enum(['evidence', 'expected', 'actual', 'diff', 'trace', 'debug']);
export const FailureClassSchema = z.enum([
  'source-node-mismatch',
  'token-mismatch',
  'baseline-export-mismatch',
  'framing-layout-mismatch',
  'adapter-fixture-mismatch',
  'runtime-implementation-mismatch',
  'render-noise',
  'unknown',
  'route-failure',
  'auth-gate-failure',
  'dom-contract-failure',
  'accessibility-contract-failure',
  'layout-overflow',
  'console-error',
  'network-error',
  'visual-diff',
  'component-drift',
  'environment-mismatch',
  'missing-baseline',
  'flaky-unstable-screenshot',
  'artifact-redaction-warning',
  'tool-error'
]);

export const DiagnosticEvidenceSchema = z.object({
  kind: z.string().min(1),
  summary: z.string().min(1).optional(),
  data: z.record(z.string(), z.unknown()).optional()
});

export const CheckDiagnosticSchema = z.object({
  kind: z.string().min(1),
  message: z.string().min(1),
  severity: z.enum(['info', 'warning', 'error']).optional(),
  evidence: z.array(DiagnosticEvidenceSchema).optional()
});

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
  failureClass: FailureClassSchema.optional(),
  confidence: z.number().min(0).max(1).optional(),
  diagnostics: z.array(CheckDiagnosticSchema).optional(),
  evidence: z.array(DiagnosticEvidenceSchema).optional(),
  recommendations: z.array(z.string().min(1)).optional(),
  suggestedNextStep: z.string().optional()
});

export const SuggestedNextStepSchema = z.object({
  kind: z.string().min(1),
  summary: z.string().min(1)
});

export const EvidenceGroupSchema = z.object({
  id: z.string().min(1),
  checks: z.array(z.string().min(1)),
  artifacts: z.array(ArtifactRefSchema),
  metadata: z.record(z.string(), z.unknown()).optional()
});

const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);

// A file or directory entry the run depended on, so a reader can later tell whether the inputs changed.
export const ReportInputSchema = z.object({
  role: z.string().min(1),
  // Relative to the config directory, with forward slashes; never an absolute path.
  key: z.string().min(1),
  hashKind: z.enum(['bytes', 'canonical-json']),
  sha256: Sha256Schema.optional(),
  bytes: z.number().int().nonnegative().optional(),
  missing: z.boolean().optional()
});

export const ResultHashSchema = z.object({
  // Stable across identical runs: only check id, status, severity and failure class.
  verdict: Sha256Schema,
  // Adds measurements and artifact hashes; informational, because animated states can drift.
  measured: Sha256Schema
});

export const ReportSummarySchema = z.object({
  passed: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  warnings: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  blockingFailures: z.number().int().nonnegative(),
  reviewItems: z.number().int().nonnegative()
});

export const ReflectionReportV2Schema = z.object({
  schemaVersion: z.literal(1),
  runId: z.string().min(1),
  project: z.string().min(1),
  startedAt: z.string().datetime(),
  finishedAt: z.string().datetime(),
  status: ReportStatusSchema,
  mode: z.enum(['smoke', 'design', 'visual', 'print', 'full']),
  ci: z.boolean(),
  environment: z.record(z.string(), z.unknown()),
  summary: ReportSummarySchema,
  checks: z.array(CheckResultSchema),
  artifacts: z.array(ArtifactRefSchema),
  suggestedNextSteps: z.array(SuggestedNextStepSchema)
});

export const ReflectionReportSchema = z.object({
  schemaVersion: z.literal(2),
  runId: z.string().min(1),
  project: z.string().min(1),
  startedAt: z.string().datetime(),
  finishedAt: z.string().datetime(),
  status: ReportStatusSchema,
  mode: z.enum(['smoke', 'design', 'visual', 'print', 'full']),
  ci: z.boolean(),
  environment: z.record(z.string(), z.unknown()),
  summary: ReportSummarySchema,
  checks: z.array(CheckResultSchema),
  artifacts: z.array(ArtifactRefSchema),
  suggestedNextSteps: z.array(SuggestedNextStepSchema),
  evidenceGroups: z.array(EvidenceGroupSchema),
  inputs: z.array(ReportInputSchema).optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
  resultHash: ResultHashSchema.optional()
});

export type CheckStatus = z.output<typeof CheckStatusSchema>;
export type CheckSeverity = z.output<typeof CheckSeveritySchema>;
export type CheckSuite = z.output<typeof CheckSuiteSchema>;
export type ReportStatus = z.output<typeof ReportStatusSchema>;
export type ArtifactRef = z.output<typeof ArtifactRefSchema>;
export type FailureClass = z.output<typeof FailureClassSchema>;
export type DiagnosticEvidence = z.output<typeof DiagnosticEvidenceSchema>;
export type CheckDiagnostic = z.output<typeof CheckDiagnosticSchema>;
export type CheckResult = z.output<typeof CheckResultSchema>;
export type ReflectionReport = z.output<typeof ReflectionReportSchema>;
export type ReportSummary = z.output<typeof ReportSummarySchema>;
export type ReportInput = z.output<typeof ReportInputSchema>;
export type ResultHash = z.output<typeof ResultHashSchema>;
export type SuggestedNextStep = z.output<typeof SuggestedNextStepSchema>;
export type EvidenceGroup = z.output<typeof EvidenceGroupSchema>;

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
    (check) => (check.suite === 'visual' || check.suite === 'print') && check.severity === 'review' && check.metadata.classification === 'missing-baseline'
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
  if (parsed.success) {
    return parsed.data;
  }

  const parsedV1 = ReflectionReportV2Schema.safeParse(report);
  if (parsedV1.success) {
    return {
      ...parsedV1.data,
      schemaVersion: 2,
      evidenceGroups: deriveEvidenceGroups(parsedV1.data.checks, parsedV1.data.artifacts)
    };
  }

  const details = parsed.error.issues.map((issue) => `${issue.path.join('.') || 'report'}: ${issue.message}`).join('; ');
  throw new Error(`Invalid Reflection report: ${details}`);
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
  inputs?: ReportInput[];
  meta?: Record<string, unknown>;
}): ReflectionReport {
  const status = deriveReportStatus(input.checks);
  return validateReport({
    schemaVersion: 2,
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
    suggestedNextSteps: input.suggestedNextSteps ?? deriveSuggestedNextSteps(input.checks),
    evidenceGroups: deriveEvidenceGroups(input.checks, input.artifacts ?? []),
    ...(input.inputs ? { inputs: input.inputs } : {}),
    ...(input.meta ? { meta: input.meta } : {}),
    resultHash: computeResultHash(input.checks)
  });
}

export function deriveEvidenceGroups(checks: CheckResult[], reportArtifacts: ArtifactRef[] = []): EvidenceGroup[] {
  const groups = new Map<string, { checks: string[]; artifacts: ArtifactRef[] }>();

  for (const check of checks) {
    const scenario = typeof check.metadata.scenario === 'string' ? check.metadata.scenario : undefined;
    if (!scenario) {
      continue;
    }

    const group = groups.get(scenario) ?? { checks: [], artifacts: [] };
    group.checks.push(check.id);
    group.artifacts.push(...check.artifacts);
    groups.set(scenario, group);
  }

  return [...groups.entries()].map(([id, group]) => ({
    id,
    checks: [...new Set(group.checks)],
    artifacts: dedupeArtifacts([...group.artifacts, ...reportArtifacts.filter((artifact) => artifact.path.split('/').includes(id))])
  }));
}

function dedupeArtifacts(artifacts: ArtifactRef[]): ArtifactRef[] {
  const seen = new Set<string>();
  const deduped: ArtifactRef[] = [];
  for (const artifact of artifacts) {
    if (seen.has(artifact.path)) {
      continue;
    }
    seen.add(artifact.path);
    deduped.push(artifact);
  }
  return deduped;
}

function formatCheckList(checks: CheckResult[]): string {
  const ids = checks.map((check) => check.id);
  if (ids.length <= 3) {
    return ids.join(', ');
  }

  return `${ids.slice(0, 3).join(', ')} and ${ids.length - 3} more`;
}
