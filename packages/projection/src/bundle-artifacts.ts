import type { Artifact } from './comparison.js';
import type { Projection } from './projection.js';

/** Every artifact a projection points at, as the objects themselves (so a caller can fill in hashes). */
export function collectArtifactRefs(projection: Projection): Artifact[] {
  const artifacts: Artifact[] = [];
  for (const comparison of projection.comparisons) {
    if (comparison.reference) {
      artifacts.push(comparison.reference.artifact);
    }
    if (comparison.actual) {
      artifacts.push(comparison.actual);
    }
    if (comparison.diff?.artifact) {
      artifacts.push(comparison.diff.artifact);
    }
  }
  return artifacts;
}
