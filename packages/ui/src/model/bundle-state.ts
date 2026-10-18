import { computeValidity, summarizeProjection, toIntegrityFailures, type BundleProblem, type CoverageSummary, type OpenedBundle, type Projection, type Validity } from 'reflection-projection';
import { collectArtifactRefs } from 'reflection-projection';

export interface PreparedBundle {
  projection: Projection;
  validity: Validity;
  problems: BundleProblem[];
  // Comparisons whose evidence could not be used. They are counted as unknown, never as passed or failed.
  unusableComparisonIds: ReadonlySet<string>;
  summary: CoverageSummary;
}

/**
 * Turns an opened bundle into what the views read. A comparison with an unusable file loses its proof, so its
 * requirement reads as unknown everywhere (table, groups, counts) instead of showing an outcome nobody can check.
 */
export function prepareBundle(bundle: OpenedBundle, problems: BundleProblem[]): PreparedBundle {
  const unusable = new Set<string>();
  const comparisons = bundle.projection.comparisons.map((comparison) => {
    const unusableHere = collectArtifactRefs({ ...bundle.projection, comparisons: [comparison] }).some((artifact) => bundle.unusablePaths.has(artifact.path));
    if (!unusableHere) {
      return comparison;
    }
    unusable.add(comparison.id);
    return { ...comparison, proof: {} };
  });

  const projection = { ...bundle.projection, comparisons };
  return {
    projection,
    validity: bundleValidity(projection, problems),
    problems,
    unusableComparisonIds: unusable,
    summary: summarizeProjection(projection)
  };
}

/**
 * A bundle has no live inputs to compare with, so a sound one is "offline": its freshness is not verified.
 * Current and stale only exist where a runner can hash the inputs as they are now.
 */
export function bundleValidity(projection: Projection, problems: BundleProblem[]): Validity {
  const recorded = projection.runs.length === 0 ? undefined : projection.runs.flatMap((run) => run.inputs ?? []);
  return computeValidity(recorded, undefined, { integrityFailures: toIntegrityFailures(problems) });
}
