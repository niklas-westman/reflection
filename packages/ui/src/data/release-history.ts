import { useMemo } from 'react';
import { buildReleaseHistory, type ReleaseHistory } from '../model/release-history';
import { useArchive, useBundleList, useOpenedBundles } from './bundle-queries';

export interface ReleaseHistoryState {
  history: ReleaseHistory | undefined;
  // Archive entries the index named that are not valid summaries.
  unreadableArchive: number;
}

/** Every release the viewer knows about: bundles it can open in full, and summaries of ones that were removed. */
export function useReleaseHistory(): ReleaseHistoryState {
  const list = useBundleList();
  const archive = useArchive();
  const entries = list.data ?? [];
  const opened = useOpenedBundles(entries);
  const updated = opened.map((query) => query.dataUpdatedAt).join('|');

  const history = useMemo(
    () => (list.isPending || archive.isPending ? undefined : buildReleaseHistory({ bundles: entries.map((entry, index) => ({ id: entry.id, result: opened[index]?.data })), archive: archive.data?.summaries ?? [] })),
    // `opened` changes identity every render; the update times say when its data did.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [list.isPending, archive.isPending, archive.data, entries.length, updated]
  );
  return { history, unreadableArchive: archive.data?.unreadable ?? 0 };
}
