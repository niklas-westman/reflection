import { useMemo } from 'react';
import { diffProjections, type Projection, type ProjectionDiff } from 'reflection-projection';
import { findPreviousBundle, type PreviousMatch } from '../model/previous-release';
import { useBundleView } from './bundle-context';
import { useBundleList, useOpenedBundles } from './bundle-queries';
import type { ImageSource } from '../components/atoms/artifact-image';

export type ReleaseDiffState =
  | { status: 'first-release' }
  | { status: 'loading' }
  | { status: 'unavailable'; previousRelease: string }
  | { status: 'ready'; previousRelease: string; previousState: 'candidate' | 'released'; diff: ProjectionDiff; previousSource: ImageSource; previousProjection: Projection };

/**
 * What changed since the release this one names as its previous. The previous bundle is looked up among the
 * bundles the viewer can read; if it is not there (pruned, or never published here) nothing is guessed.
 */
export function useReleaseDiff(): ReleaseDiffState {
  const { manifest, prepared } = useBundleView();
  const list = useBundleList();
  const entries = list.data ?? [];
  const opened = useOpenedBundles(entries);

  const match: PreviousMatch = useMemo(
    // A first release has nothing to wait for, so it is known before the list of bundles is.
    () => (list.isPending && manifest.release.previousRelease !== null ? { status: 'loading' } : findPreviousBundle(manifest, entries.map((entry, index) => ({ id: entry.id, result: opened[index]?.data })))),
    // `opened` changes identity every render; its data is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [manifest, list.isPending, entries.length, opened.map((query) => query.dataUpdatedAt).join('|')]
  );

  return useMemo((): ReleaseDiffState => {
    if (match.status === 'first-release' || match.status === 'loading') return { status: match.status };
    if (match.status === 'not-found' || match.status === 'rejected') return { status: 'unavailable', previousRelease: match.previousRelease };
    const { bundle } = match.result;
    return {
      status: 'ready',
      previousRelease: match.previousRelease,
      previousState: bundle.manifest.release.state,
      diff: diffProjections(bundle.projection, prepared.projection),
      previousSource: { bundleId: match.bundleId, manifest: bundle.manifest, unusablePaths: bundle.unusablePaths },
      previousProjection: bundle.projection
    };
  }, [match, prepared]);
}
