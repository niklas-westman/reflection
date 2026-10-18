import type { Artifact, Comparison } from './comparison.js';
import type { ReportInput, Run } from './evidence.js';
import { projectionSchema, type Projection } from './projection.js';
import type { Requirement } from './requirement.js';

// The part of a Reflection report this reader uses. Structural on purpose, so the projection package does not
// depend on the engine and older reports with fewer fields still project.
export interface ReflectionReportLike {
  runId: string;
  project: string;
  startedAt?: string;
  finishedAt: string;
  environment: Record<string, unknown>;
  checks: ReflectionCheckLike[];
  inputs?: ReportInput[] | undefined;
  resultHash?: { verdict: string; measured: string } | undefined;
}

export interface ReflectionCheckLike {
  id: string;
  suite: string;
  status: 'pass' | 'warn' | 'fail' | 'skipped' | 'error';
  severity: 'blocking' | 'review' | 'info';
  failureClass?: string | undefined;
  artifacts: Array<{ role?: string | undefined; path: string; sha256?: string | undefined; bytes?: number | undefined }>;
  metadata: Record<string, unknown>;
}

export interface FromReflectionReportOptions {
  projectName?: string;
  generatedAt?: string;
}

/**
 * Projects a native Reflection report. Only visual checks become requirements and comparisons.
 * The engine cannot declare required items, so the inventory is "executed-only": what did not run is not
 * visible here, and the counts are a lower bound. Needs-design and not-enrolled are not concepts of this reader.
 */
export function projectFromReflectionReport(report: ReflectionReportLike, options: FromReflectionReportOptions = {}): Projection {
  const visualChecks = report.checks.filter((check) => check.suite === 'visual');
  const requirements = visualChecks.map(toRequirement);
  const comparisons = visualChecks.map((check) => toComparison(check, report.runId));

  return projectionSchema.parse({
    schemaVersion: 1,
    project: { id: report.project, name: options.projectName ?? report.project },
    provider: { name: 'reflection-check-report', version: readString(report.environment.reflectionVersion), readinessConcepts: { needsDesign: false, notEnrolled: false }, capabilities: [] },
    generatedAt: options.generatedAt ?? report.finishedAt,
    inventory: 'executed-only',
    requirements,
    comparisons,
    runs: [toRun(report)]
  });
}

function toRequirement(check: ReflectionCheckLike): Requirement {
  const id = readString(check.metadata.ref) ?? check.id;
  return {
    id,
    label: check.id,
    subject: {
      kind: check.metadata.componentSource ? 'component' : 'page',
      id: readString(check.metadata.storyId) ?? readString(check.metadata.path) ?? readString(check.metadata.routeId) ?? check.id,
      ...optional('viewport', readString(check.metadata.viewport)),
      ...optional('state', readString(check.metadata.state))
    },
    requiredProofs: ['visual'],
    enrolled: true
  };
}

function toComparison(check: ReflectionCheckLike, runId: string): Comparison {
  const reference = findArtifact(check, 'expected');
  const actual = findArtifact(check, 'actual');
  const diff = findArtifact(check, 'diff');
  const diffPixels = readNumber(check.metadata.diffPixels);
  const diffRatio = readNumber(check.metadata.diffRatio);

  return {
    id: check.id,
    requirementId: readString(check.metadata.ref) ?? check.id,
    subject: {
      kind: check.metadata.componentSource ? 'component' : 'page',
      id: readString(check.metadata.storyId) ?? readString(check.metadata.path) ?? readString(check.metadata.routeId) ?? check.id,
      ...optional('viewport', readString(check.metadata.viewport)),
      ...optional('state', readString(check.metadata.state))
    },
    runId,
    ...(reference ? { reference: { artifact: toArtifact(reference, 'reference'), approval: { state: 'none' } } } : {}),
    ...(actual ? { actual: toArtifact(actual, 'actual') } : {}),
    ...(diffPixels !== undefined
      ? { diff: { ...(diff ? { artifact: toArtifact(diff, 'diff') } : {}), metric: { name: 'diff-pixels', value: diffPixels, ...optional('ratio', diffRatio), diffPixels } } }
      : {}),
    proof: { visual: visualProof(check.status) },
    verdict: { status: check.status, severity: check.severity, ...optional('failureClass', check.failureClass) },
    ...optional('capturePolicyHash', readCapturePolicyHash(check.metadata))
  };
}

function toRun(report: ReflectionReportLike): Run {
  const { environment } = report;
  const runner: Record<string, unknown> = {};
  for (const key of ['nodeVersion', 'playwrightVersion', 'platform', 'browser'] as const) {
    if (environment[key] !== undefined) {
      runner[key] = environment[key];
    }
  }

  return {
    id: report.runId,
    ...optional('startedAt', report.startedAt),
    finishedAt: report.finishedAt,
    engine: { name: 'reflection-check', ...optional('version', readString(environment.reflectionVersion)) },
    runner,
    ...(report.inputs ? { inputs: report.inputs } : {}),
    ...(report.resultHash ? { verdictHash: report.resultHash.verdict, measuredHash: report.resultHash.measured } : {})
  };
}

// A pixel diff beyond the threshold (warn) or a hard failure both mean the visual proof did not pass.
// An execution error or a skipped check means it was not run; neither is ever a pass.
function visualProof(status: ReflectionCheckLike['status']): 'passed' | 'failed' | 'not-run' {
  if (status === 'pass') {
    return 'passed';
  }
  return status === 'warn' || status === 'fail' ? 'failed' : 'not-run';
}

function findArtifact(check: ReflectionCheckLike, role: string): ReflectionCheckLike['artifacts'][number] | undefined {
  return check.artifacts.find((artifact) => artifact.role === role);
}

function toArtifact(artifact: ReflectionCheckLike['artifacts'][number], role: Artifact['role']): Artifact {
  return {
    role,
    path: artifact.path,
    ...optional('sha256', artifact.sha256),
    ...optional('bytes', artifact.bytes)
  };
}

function readCapturePolicyHash(metadata: Record<string, unknown>): string | undefined {
  const policy = metadata.capturePolicy;
  return policy !== null && typeof policy === 'object' ? readString((policy as { hash?: unknown }).hash) : undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

// Adds a property only when it has a value, which exactOptionalPropertyTypes requires.
function optional<Key extends string, Value>(key: Key, value: Value | undefined): { [K in Key]?: Value } {
  return value === undefined ? {} : ({ [key]: value } as { [K in Key]?: Value });
}
