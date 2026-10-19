import { useQueries, useQuery, type UseQueryResult } from '@tanstack/react-query';
import { openBundle, verifyBundleFile, type BundleManifest, type BundleProblemCode, type OpenBundleResult } from 'reflection-projection';
import { useBundleCatalog, type BundleListEntry } from './bundle-catalog';

export function useBundleList(): UseQueryResult<BundleListEntry[]> {
  const catalog = useBundleCatalog();
  return useQuery({ queryKey: ['bundles'], queryFn: () => catalog.list() });
}

/** Opens one bundle: manifest, hash and projection checked. Individual files are verified when they load. */
export function useBundle(bundleId: string): UseQueryResult<OpenBundleResult> {
  const catalog = useBundleCatalog();
  return useQuery({ queryKey: ['bundle', bundleId], queryFn: () => openBundle(catalog.source(bundleId)), staleTime: Infinity });
}

/** Reads and hashes every file in the background, so a missing or tampered image is found, not only noticed when it loads. */
export function useVerifiedBundle(bundleId: string, enabled: boolean): UseQueryResult<OpenBundleResult> {
  const catalog = useBundleCatalog();
  return useQuery({
    queryKey: ['bundle-verified', bundleId],
    enabled,
    staleTime: Infinity,
    queryFn: () => openBundle(catalog.source(bundleId), { verifyFiles: 'all' })
  });
}

export function useOpenedBundles(entries: BundleListEntry[]): Array<UseQueryResult<OpenBundleResult>> {
  const catalog = useBundleCatalog();
  return useQueries({
    queries: entries.map((entry) => ({ queryKey: ['bundle', entry.id], queryFn: () => openBundle(catalog.source(entry.id)), staleTime: Infinity }))
  });
}

export type ArtifactState = { status: 'ready'; url: string } | { status: 'unusable'; reason: string; code: BundleProblemCode };

/** A verified image as an object URL. A file that is missing or does not match its hash is never returned. */
export function useArtifactUrl(bundleId: string, manifest: BundleManifest, path: string, enabled: boolean): UseQueryResult<ArtifactState> {
  const catalog = useBundleCatalog();
  return useQuery({
    queryKey: ['artifact', bundleId, manifest.bundleHash, path],
    enabled,
    staleTime: Infinity,
    queryFn: async (): Promise<ArtifactState> => {
      const verified = await verifyBundleFile(catalog.source(bundleId), manifest, path);
      if (!verified.ok) {
        return { status: 'unusable', reason: verified.problem.message, code: verified.problem.code };
      }
      const bytes = new Uint8Array(verified.bytes);
      return { status: 'ready', url: URL.createObjectURL(new Blob([bytes], { type: mimeOf(path) })) };
    }
  });
}

function mimeOf(path: string): string {
  const extension = path.slice(path.lastIndexOf('.') + 1).toLowerCase();
  return extension === 'jpg' ? 'image/jpeg' : `image/${extension}`;
}
