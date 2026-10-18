import { createContext, useContext, type ReactNode } from 'react';
import type { BundleManifest } from 'reflection-projection';
import type { PreparedBundle } from '../model/bundle-state';

export interface OpenBundleView {
  bundleId: string;
  manifest: BundleManifest;
  prepared: PreparedBundle;
  unusablePaths: ReadonlySet<string>;
  // True while the files are still being checked, so the counts are not yet confirmed.
  verifying: boolean;
}

const BundleContext = createContext<OpenBundleView | undefined>(undefined);

export function BundleViewProvider({ value, children }: { value: OpenBundleView; children: ReactNode }): ReactNode {
  return <BundleContext.Provider value={value}>{children}</BundleContext.Provider>;
}

export function useBundleView(): OpenBundleView {
  const view = useContext(BundleContext);
  if (!view) {
    throw new Error('useBundleView needs an open bundle');
  }
  return view;
}
