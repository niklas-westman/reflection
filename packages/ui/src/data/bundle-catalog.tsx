import { createContext, useContext, type ReactNode } from 'react';
import { BundleFileMissingError, type BundleSource } from 'reflection-projection';

export interface BundleListEntry {
  id: string;
}

/** Where bundles come from. The viewer knows nothing else about hosting. */
export interface BundleCatalog {
  list(): Promise<BundleListEntry[]>;
  source(bundleId: string): BundleSource;
}

/** Reads bundles over HTTP from `<baseUrl>/index.json` and `<baseUrl>/<bundle>/<path>`. */
export function createHttpCatalog(baseUrl: string): BundleCatalog {
  const base = baseUrl.replace(/\/+$/, '');

  return {
    async list(): Promise<BundleListEntry[]> {
      const response = await fetch(`${base}/index.json`);
      if (!response.ok) {
        throw new Error(`The bundle list could not be loaded (HTTP ${response.status}).`);
      }
      const body = (await response.json()) as { bundles?: BundleListEntry[] };
      return body.bundles ?? [];
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
