import { createContext, useContext, type ReactNode } from 'react';
import { archiveSummarySchema, BundleFileMissingError, type ArchiveSummary, type BundleSource } from 'reflection-projection';

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
  // Releases that left their slot: a small summary each, no evidence.
  archive(): Promise<ArchiveListing>;
  source(bundleId: string): BundleSource;
}

/** Reads bundles over HTTP from `<baseUrl>/index.json` and `<baseUrl>/<bundle>/<path>`. */
export function createHttpCatalog(baseUrl: string): BundleCatalog {
  const base = baseUrl.replace(/\/+$/, '');

  async function readIndex(): Promise<{ bundles?: BundleListEntry[]; archive?: unknown[] }> {
    const response = await fetch(`${base}/index.json`);
    if (!response.ok) {
      throw new Error(`The bundle list could not be loaded (HTTP ${response.status}).`);
    }
    return (await response.json()) as { bundles?: BundleListEntry[]; archive?: unknown[] };
  }

  return {
    async list(): Promise<BundleListEntry[]> {
      return (await readIndex()).bundles ?? [];
    },
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
