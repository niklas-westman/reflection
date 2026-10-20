import { createContext, useContext, type ReactNode } from 'react';
import { archiveSummarySchema, BundleFileMissingError, decisionListSchema, releaseIndexSchema, type ArchiveSummary, type BundleSource, type Decision, type ReleaseIndex } from 'reflection-projection';

export interface BundleListEntry {
  id: string;
}

export interface ArchiveListing {
  summaries: ArchiveSummary[];
  // Entries the index named that are not valid archive summaries. They are counted, never silently dropped.
  unreadable: number;
}

/** Where bundles come from. The viewer knows nothing else about hosting. */
export interface BundleCatalog {
  list(): Promise<BundleListEntry[]>;
  // Project id to the bundle the host names as the latest for it, or null. Never inferred.
  latest(): Promise<Record<string, string | null>>;
  // Releases that left their slot: a small summary each, no evidence.
  archive(): Promise<ArchiveListing>;
  source(bundleId: string): BundleSource;
  // The decisions recorded for a release, oldest first. Absent when the host records no decisions.
  decisions?: (release: string) => Promise<Decision[]>;
}

/**
 * Reads bundles over HTTP from `<baseUrl>/index.json` and `<baseUrl>/<bundle>/<path>`, and decisions from
 * `<decisionsUrl>/decisions?release=<release>` when the host records them.
 */
export function createHttpCatalog(baseUrl: string, options: { decisionsUrl?: string | undefined } = {}): BundleCatalog {
  const base = baseUrl.replace(/\/+$/, '');

  async function readIndex(): Promise<ReleaseIndex> {
    const response = await fetch(`${base}/index.json`);
    if (!response.ok) {
      throw new Error(`The bundle list could not be loaded (HTTP ${response.status}).`);
    }
    const parsed = releaseIndexSchema.safeParse(await response.json().catch(() => undefined));
    if (!parsed.success) {
      throw new Error(`The bundle list is not valid: ${parsed.error.issues.map((issue) => `${issue.path.join('.') || 'index'} ${issue.message}`).join('; ')}`);
    }
    return parsed.data;
  }

  const decisionsBase = options.decisionsUrl?.replace(/\/+$/, '');
  return {
    async list(): Promise<BundleListEntry[]> {
      return (await readIndex()).bundles;
    },
    async latest(): Promise<Record<string, string | null>> {
      return (await readIndex()).latest;
    },
    ...(decisionsBase
      ? {
          async decisions(release: string): Promise<Decision[]> {
            const response = await fetch(`${decisionsBase}/decisions?release=${encodeURIComponent(release)}`, { credentials: 'same-origin' });
            if (!response.ok) {
              throw new Error(`The decisions could not be loaded (HTTP ${response.status}).`);
            }
            const parsed = decisionListSchema.safeParse(await response.json().catch(() => undefined));
            if (!parsed.success) {
              throw new Error('The decisions the host returned are not valid.');
            }
            return parsed.data.decisions;
          }
        }
      : {}),
    async archive(): Promise<ArchiveListing> {
      const parsed = ((await readIndex()).archive ?? []).map((entry) => archiveSummarySchema.safeParse(entry));
      return { summaries: parsed.flatMap((result) => (result.success ? [result.data] : [])), unreadable: parsed.filter((result) => !result.success).length };
    },
    source(bundleId: string): BundleSource {
      return {
        async read(path: string): Promise<Uint8Array> {
          const response = await fetch(`${base}/${encodeURIComponent(bundleId)}/${path.split('/').map(encodeURIComponent).join('/')}`);
          if (response.status === 404) {
            throw new BundleFileMissingError(path);
          }
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }
          return new Uint8Array(await response.arrayBuffer());
        }
      };
    }
  };
}

const CatalogContext = createContext<BundleCatalog | undefined>(undefined);

export function BundleCatalogProvider({ catalog, children }: { catalog: BundleCatalog; children: ReactNode }): ReactNode {
  return <CatalogContext.Provider value={catalog}>{children}</CatalogContext.Provider>;
}

export function useBundleCatalog(): BundleCatalog {
  const catalog = useContext(CatalogContext);
  if (!catalog) {
    throw new Error('useBundleCatalog needs a BundleCatalogProvider');
  }
  return catalog;
}
