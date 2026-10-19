import type { BundleManifest, OpenBundleResult } from 'reflection-projection';

export interface BundleCandidate {
  id: string;
  result: OpenBundleResult | undefined;
}

export type PreviousMatch =
  | { status: 'first-release' }
  | { status: 'loading' }
  | { status: 'not-found'; previousRelease: string }
  | { status: 'rejected'; previousRelease: string; bundleId: string; reason: string }
  | { status: 'found'; previousRelease: string; bundleId: string; result: Extract<OpenBundleResult, { status: 'opened' }> };

/**
 * The bundle of the release this one is compared with: the same project and the release named in the manifest.
 * A released build wins over a candidate, and a later build over an earlier one. Nothing else is guessed.
 */
export function findPreviousBundle(current: BundleManifest, candidates: BundleCandidate[]): PreviousMatch {
  const previousRelease = current.release.previousRelease;
  if (previousRelease === null) {
    return { status: 'first-release' };
  }
  if (candidates.some((candidate) => candidate.result === undefined)) {
    return { status: 'loading' };
  }

  const matches = candidates
    .flatMap((candidate) => (candidate.result?.status === 'opened' && candidate.result.bundle.manifest.project.id === current.project.id && candidate.result.bundle.manifest.release.release === previousRelease ? [{ id: candidate.id, result: candidate.result }] : []))
    .sort((a, b) => rank(b.result.bundle.manifest) - rank(a.result.bundle.manifest));
  const best = matches[0];
  if (best) {
    return { status: 'found', previousRelease, bundleId: best.id, result: best.result };
  }

  // A rejected bundle has no readable manifest, so it can only be named when it is the only thing that could be it.
  return { status: 'not-found', previousRelease };
}

const rank = (manifest: BundleManifest): number => (manifest.release.state === 'released' ? 1_000_000 : 0) + manifest.release.build;
