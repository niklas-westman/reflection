import { computeValidity, summarizeProjection, supersededComparisonIds, toIntegrityFailures, type BundleProblem, type Comparison, type CoverageSummary, type OpenedBundle, type Projection, type Validity } from 'reflection-projection';
import { collectArtifactRefs } from 'reflection-projection';

export interface PreparedBundle {
  projection: Projection;
  validity: Validity;
  problems: BundleProblem[];
  // Comparisons whose evidence could not be used. They are counted as unknown, never as passed or failed.
  unusableComparisonIds: ReadonlySet<string>;
  // Comparisons that read a superseded design source. They proved an old design, so they count as unknown too.
  supersededComparisonIds: ReadonlySet<string>;
  // The comparisons above as the provider recorded them, before their proof was set aside, for the comparison page.
  recordedComparisons: ReadonlyMap<string, Comparison>;
  summary: CoverageSummary;
}

/**
 * Turns an opened bundle into what the views read. A comparison with an unusable file, or one that read a
 * superseded design source, loses its proof, so its requirement reads as unknown everywhere (table, groups,
 * counts) instead of showing an outcome nobody can check or one about an old design.
 */
export function prepareBundle(bundle: OpenedBundle, problems: BundleProblem[]): PreparedBundle {
  const unusable = new Set<string>();
  const superseded = supersededComparisonIds(bundle.projection);
  const recorded = new Map<string, Comparison>();
  const comparisons = bundle.projection.comparisons.map((comparison) => {
    const unusableHere = collectArtifactRefs({ ...bundle.projection, comparisons: [comparison] }).some((artifact) => bundle.unusablePaths.has(artifact.path));
    if (unusableHere) unusable.add(comparison.id);
    if (!unusableHere && !superseded.has(comparison.id)) {
      return comparison;
    }
    recorded.set(comparison.id, comparison);
    return { ...comparison, proof: {} };
  });

  const projection = { ...bundle.projection, comparisons };
  return {
    projection,
    validity: bundleValidity(projection, problems),
    problems,
    unusableComparisonIds: unusable,
    supersededComparisonIds: superseded,
    recordedComparisons: recorded,
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
