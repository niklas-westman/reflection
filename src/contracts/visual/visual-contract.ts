import type { ArtifactStore } from '../../core/artifact-store.js';
import type { CheckResult } from '../../core/report-schema.js';
import { compareRouteVisualBaseline, type RouteVisualBaselineCase } from './baseline-compare.js';

export type VisualContractConfig = {
  smoke?: RouteVisualBaselineCase[];
};

export async function runRouteVisualSmoke(input: {
  visualSmoke?: RouteVisualBaselineCase[] | undefined;
  browserChecks: CheckResult[];
  store: ArtifactStore;
}): Promise<CheckResult[]> {
  if (!input.visualSmoke || input.visualSmoke.length === 0) {
    return [];
  }

  const checks: CheckResult[] = [];
  for (const visualCase of input.visualSmoke) {
    const routeCheck = input.browserChecks.find(
      (check) => check.metadata.routeId === visualCase.route && check.metadata.viewport === visualCase.viewport
    );

    if (!routeCheck) {
      checks.push({
        id: `visual.${visualCase.id}`,
        suite: 'visual',
        target: `${visualCase.route} ${visualCase.viewport}`,
        status: visualCase.blocking === true || visualCase.strict === true ? 'fail' : 'warn',
        severity: visualCase.blocking === true || visualCase.strict === true ? 'blocking' : 'review',
        summary: `Missing browser route result for visual case ${visualCase.id}.`,
        artifacts: [],
        metadata: {
          classification: 'missing-browser-route-result',
          routeId: visualCase.route,
          viewport: visualCase.viewport,
          baselinePath: visualCase.baseline
        },
        suggestedNextStep: 'Add a matching browser route and viewport before enabling this visual case.'
      });
      continue;
    }

    checks.push(await compareRouteVisualBaseline({ visualCase, routeCheck, store: input.store }));
  }

  return checks;
}
