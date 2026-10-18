import { createHash } from 'node:crypto';
import { canonicalJson } from './canonical-json.js';
import type { ArtifactRef, CheckResult } from './report-schema.js';

export interface ComputedResultHash {
  verdict: string;
  measured: string;
}

/**
 * Two hashes over a run's checks. `verdict` ignores everything that can differ between identical runs
 * (timestamps, run ids, paths, pixel counts), so a consumer can tell "same outcome" from "different outcome".
 * `measured` adds the measurements and artifact hashes for informational comparison.
 */
export function computeResultHash(checks: CheckResult[]): ComputedResultHash {
  const ordered = [...checks].sort(compareById);
  return {
    verdict: sha256Of(ordered.map(toVerdictEntry)),
    measured: sha256Of(ordered.map(toMeasuredEntry))
  };
}

function compareById(a: CheckResult, b: CheckResult): number {
  if (a.id === b.id) {
    return 0;
  }
  return a.id < b.id ? -1 : 1;
}

function toVerdictEntry(check: CheckResult): Record<string, unknown> {
  return { id: check.id, status: check.status, severity: check.severity, failureClass: check.failureClass ?? null };
}

function toMeasuredEntry(check: CheckResult): Record<string, unknown> {
  const metadata = check.metadata;
  return {
    ...toVerdictEntry(check),
    diffPixels: metadata.diffPixels,
    diffRatio: metadata.diffRatio,
    expected: metadata.expected,
    actual: metadata.actual,
    dimensionMismatch: metadata.dimensionMismatch,
    capturePolicyHash: readCapturePolicyHash(metadata),
    artifacts: [...check.artifacts].sort(compareByPath).map(toArtifactEntry)
  };
}

function readCapturePolicyHash(metadata: Record<string, unknown>): unknown {
  const policy = metadata.capturePolicy;
  if (policy === null || typeof policy !== 'object') {
    return undefined;
  }
  return (policy as { hash?: unknown }).hash;
}

function compareByPath(a: ArtifactRef, b: ArtifactRef): number {
  if (a.path === b.path) {
    return 0;
  }
  return a.path < b.path ? -1 : 1;
}

function toArtifactEntry(artifact: ArtifactRef): Record<string, unknown> {
  return { role: artifact.role, path: artifact.path, sha256: artifact.sha256 };
}

function sha256Of(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}
