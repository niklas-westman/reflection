import { deriveReadiness, standingDeviations, type Projection, type StandingDeviation } from 'reflection-projection';

/** The accepted deviation that covers each comparison, if any, with whether it still holds. */
export function indexDeviations(projection: Projection, bundleId: string): ReadonlyMap<string, StandingDeviation> {
  const byComparison = new Map<string, StandingDeviation>();
  for (const deviation of standingDeviations(projection, bundleId)) {
    for (const id of deviation.comparisonIds) byComparison.set(id, deviation);
  }
  return byComparison;
}

export function deviationHolds(deviation: StandingDeviation | undefined): boolean {
  return deviation?.standing.state === 'holds' || deviation?.standing.state === 'carried-forward';
}

/**
 * How many proven items rest on an accepted deviation, and how many accepted deviations lapsed. Counted in
 * required items and in decisions; the items stay proven either way, because a deviation is review, not proof.
 */
export function summarizeDeviations(projection: Projection, deviations: ReadonlyMap<string, StandingDeviation>): { provenItems: number; lapsed: number } {
  const concepts = projection.provider.readinessConcepts;
  const provenItems = projection.requirements.filter((requirement) => {
    const own = projection.comparisons.filter((comparison) => comparison.requirementId === requirement.id);
    return own.some((comparison) => deviationHolds(deviations.get(comparison.id))) && deriveReadiness(requirement, own, concepts) === 'proven';
  }).length;
  const lapsed = new Set([...deviations.values()].filter((deviation) => deviation.standing.state === 'lapsed').map((deviation) => deviation.decision.id)).size;
  return { provenItems, lapsed };
}
