import { access, mkdir, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { ArtifactStore } from '../../core/artifact-store.js';
import { createBaselineStore, createMissingBaselineCheck } from '../../core/baseline-store.js';
import type { CheckResult } from '../../core/report-schema.js';
import { comparePngImages } from './image-diff.js';
import type { VisualThreshold } from './thresholds.js';

export type RouteVisualBaselineCase = {
  id: string;
  route: string;
  viewport: string;
  baseline: string;
  baselineRoot?: string | undefined;
  threshold?: VisualThreshold | undefined;
  blocking?: boolean | undefined;
  strict?: boolean | undefined;
};

export type CompareRouteVisualBaselineInput = {
  visualCase: RouteVisualBaselineCase;
  routeCheck: CheckResult;
  store: ArtifactStore;
};

export async function compareRouteVisualBaseline(input: CompareRouteVisualBaselineInput): Promise<CheckResult> {
  const actualArtifact = input.routeCheck.artifacts.find((artifact) => artifact.role === 'actual' && artifact.path.endsWith('.png'));
  const target = `${String(input.routeCheck.metadata.route ?? input.visualCase.route)} ${input.visualCase.viewport}`;
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
        routeId: input.visualCase.route,
        viewport: input.visualCase.viewport,
        baselinePath: input.visualCase.baseline
      },
      suggestedNextStep: 'Add a screenshot expectation to the matching browser route before enabling this visual case.'
    };
  }

  if (!(await pathExists(baselinePath))) {
    const artifactBase = `visual/${input.visualCase.id}`;
    const actualRunPath = input.store.resolveRunPath(actualArtifact.path);
    const actualVisualArtifact = await input.store.writeBuffer(`${artifactBase}/actual.png`, await readFile(actualRunPath));

    return createMissingBaselineCheck({
      id: `visual.${input.visualCase.id}`,
      target,
      baselinePath: input.visualCase.baseline,
      blocking,
      artifacts: [actualVisualArtifact],
      metadata: {
        routeId: input.visualCase.route,
        viewport: input.visualCase.viewport
      }
    });
  }

  const artifactBase = `visual/${input.visualCase.id}`;
  const expectedArtifact = await input.store.writeBuffer(`${artifactBase}/expected.png`, await readFile(baselinePath));
  const actualRunPath = input.store.resolveRunPath(actualArtifact.path);
  const actualVisualArtifact = await input.store.writeBuffer(`${artifactBase}/actual.png`, await readFile(actualRunPath));
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

  return {
    id: `visual.${input.visualCase.id}`,
    suite: 'visual',
    target,
    status: result.status,
    severity,
    summary: createVisualSummary(input.visualCase.id, result),
    artifacts: [expectedArtifact, actualVisualArtifact, ...(diffArtifact ? [diffArtifact] : [])],
    metadata: {
      ...result,
      routeId: input.visualCase.route,
      viewport: input.visualCase.viewport,
      baselinePath: input.visualCase.baseline
    },
    ...(result.status === 'pass'
      ? {}
      : { suggestedNextStep: 'Inspect expected, actual, and diff artifacts. If intentional, update only this visual baseline.' })
  };
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

function createVisualSummary(id: string, result: { classification: string; diffRatio: number; diffPixels: number; thresholdReason?: string }): string {
  if (result.classification === 'visual-match') {
    return `${id} matches approved visual baseline.`;
  }

  if (result.classification === 'visual-dimension-mismatch') {
    return `${id} screenshot dimensions differ from approved baseline.`;
  }

  return `${id} differs from approved visual baseline by ${(result.diffRatio * 100).toFixed(2)}% (${result.diffPixels} pixels)${
    result.thresholdReason ? `, exceeding ${result.thresholdReason}` : ''
  }.`;
}
