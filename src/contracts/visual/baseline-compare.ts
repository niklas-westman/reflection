import { access, mkdir, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { ArtifactStore } from '../../core/artifact-store.js';
import { createBaselineStore, createMissingBaselineCheck } from '../../core/baseline-store.js';
import type { ArtifactRef, CheckResult } from '../../core/report-schema.js';
import { comparePngImages, formatVisualDiagnosticsDetails } from './image-diff.js';
import { readBaselineAsPngBuffer } from './image-io.js';
import type { VisualThreshold } from './thresholds.js';

export type RouteVisualBaselineCase = {
  id: string;
  route: string;
  viewport: string;
  state?: string | undefined;
  capture?: { selector: string } | undefined;
  baseline: string;
  baselineRoot?: string | undefined;
  threshold?: VisualThreshold | undefined;
  blocking?: boolean | undefined;
  strict?: boolean | undefined;
  scenario?: string | undefined;
  ref?: string | undefined;
};

export type CompareRouteVisualBaselineInput = {
  visualCase: RouteVisualBaselineCase;
  routeCheck: CheckResult;
  store: ArtifactStore;
  actualArtifact?: ArtifactRef | undefined;
};

export async function compareRouteVisualBaseline(input: CompareRouteVisualBaselineInput): Promise<CheckResult> {
  const actualArtifact =
    input.actualArtifact ?? input.routeCheck.artifacts.find((artifact) => artifact.role === 'actual' && artifact.path.endsWith('.png'));
  const target = `${String(input.routeCheck.metadata.route ?? input.visualCase.route)} ${input.visualCase.viewport}${input.visualCase.state ? ` ${input.visualCase.state}` : ''}`;
  const baselinePath = resolveCaseBaselinePath(input.visualCase);
  const blocking = input.visualCase.blocking === true || input.visualCase.strict === true;
  const strict = input.visualCase.strict === true || input.visualCase.blocking === true;

  if (!actualArtifact) {
    return {
      id: `visual.${input.visualCase.id}`,
      suite: 'visual',
      target,
      status: blocking ? 'fail' : 'warn',
      severity: blocking ? 'blocking' : 'review',
      summary: `Missing actual screenshot for visual baseline case ${input.visualCase.id}.`,
      artifacts: [],
      metadata: {
        classification: 'missing-actual-screenshot',
        ...(input.visualCase.ref ? { ref: input.visualCase.ref } : {}),
        routeId: input.visualCase.route,
        viewport: input.visualCase.viewport,
        baselinePath: input.visualCase.baseline
      },
      suggestedNextStep: 'Add a screenshot expectation to the matching browser route before enabling this visual case.'
    };
  }

  if (!(await pathExists(baselinePath))) {
    const artifactBase = `visual/${input.visualCase.id}`;
    const actualVisualArtifact = await ensureVisualActualArtifact(input.store, actualArtifact, artifactBase);

    return createMissingBaselineCheck({
      id: `visual.${input.visualCase.id}`,
      target,
      baselinePath: input.visualCase.baseline,
      blocking,
      artifacts: [actualVisualArtifact],
      metadata: {
        ...(input.visualCase.ref ? { ref: input.visualCase.ref } : {}),
        routeId: input.visualCase.route,
        viewport: input.visualCase.viewport,
        ...(input.visualCase.state ? { state: input.visualCase.state } : {}),
        ...(input.visualCase.capture ? { capture: input.visualCase.capture } : {}),
        ...(input.visualCase.scenario ? { scenario: input.visualCase.scenario } : {})
      }
    });
  }

  const artifactBase = `visual/${input.visualCase.id}`;
  const expectedArtifact = await input.store.writeBuffer(`${artifactBase}/expected.png`, (await readBaselineAsPngBuffer(baselinePath)).png);
  const actualVisualArtifact = await ensureVisualActualArtifact(input.store, actualArtifact, artifactBase);
  const diffRelativePath = `${artifactBase}/diff.png`;
  const diffPath = input.store.resolveRunPath(diffRelativePath);
  await mkdir(dirname(diffPath), { recursive: true });

  const result = await comparePngImages({
    expectedPath: baselinePath,
    actualPath: input.store.resolveRunPath(actualVisualArtifact.path),
    diffPath,
    ...(input.visualCase.threshold ? { threshold: input.visualCase.threshold } : {}),
    strict
  });
  const diffArtifact = result.diffPath ? await input.store.describeArtifact(diffRelativePath, 'visual-diff', 'diff') : undefined;

  const severity = result.status === 'fail' && blocking ? 'blocking' : 'review';
  const details = result.status === 'pass' ? undefined : formatVisualDiagnosticsDetails(result.diagnostics, result.expectedFormat);

  return {
    id: `visual.${input.visualCase.id}`,
    suite: 'visual',
    target,
    status: result.status,
    severity,
    summary: createVisualSummary(input.visualCase.id, result),
    ...(details ? { details } : {}),
    artifacts: [expectedArtifact, actualVisualArtifact, ...(diffArtifact ? [diffArtifact] : [])],
    metadata: {
      ...result,
      ...(input.visualCase.ref ? { ref: input.visualCase.ref } : {}),
      routeId: input.visualCase.route,
      viewport: input.visualCase.viewport,
      ...(input.visualCase.state ? { state: input.visualCase.state } : {}),
      baselinePath: input.visualCase.baseline,
      ...(input.visualCase.capture ? { capture: input.visualCase.capture } : {}),
      ...(input.visualCase.scenario ? { scenario: input.visualCase.scenario } : {})
    },
    ...(result.status === 'pass'
      ? {}
      : { suggestedNextStep: 'Inspect expected, actual, and diff artifacts. If intentional, update only this visual baseline.' })
  };
}

async function ensureVisualActualArtifact(store: ArtifactStore, actualArtifact: ArtifactRef, artifactBase: string): Promise<ArtifactRef> {
  if (actualArtifact.path === `${artifactBase}/actual.png`) {
    return actualArtifact;
  }

  const actualRunPath = store.resolveRunPath(actualArtifact.path);
  return store.writeBuffer(`${artifactBase}/actual.png`, await readFile(actualRunPath));
}

function resolveCaseBaselinePath(visualCase: RouteVisualBaselineCase): string {
  const store = createBaselineStore(visualCase.baselineRoot ? { rootDir: visualCase.baselineRoot } : {});
  return store.resolveBaselinePath(visualCase.baseline);
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function formatDimensions(dimensions: { width: number; height: number }): string {
  return `${dimensions.width}x${dimensions.height}`;
}

function createVisualSummary(
  id: string,
  result: {
    classification: string;
    diffRatio: number;
    diffPixels: number;
    thresholdReason?: string;
    expected: { width: number; height: number };
    actual: { width: number; height: number };
  }
): string {
  if (result.classification === 'visual-match') {
    return `${id} matches approved visual baseline.`;
  }

  if (result.classification === 'visual-dimension-mismatch') {
    return `${id} screenshot dimensions differ from approved baseline (expected ${formatDimensions(result.expected)}, actual ${formatDimensions(result.actual)}). Set a route viewport with matching width and height, or re-export the baseline at the rendered size.`;
  }

  return `${id} differs from approved visual baseline by ${(result.diffRatio * 100).toFixed(2)}% (${result.diffPixels} pixels)${
    result.thresholdReason ? `, exceeding ${result.thresholdReason}` : ''
  }.`;
}
