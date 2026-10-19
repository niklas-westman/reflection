import type { ReactNode } from 'react';
import { Banner } from '../components/molecules/banner';

/** Release changes compare two releases. Until that comparison exists the page says so instead of showing nothing. */
export function ChangesPage(): ReactNode {
  return (
    <>
      <h1 style={{ margin: '0 0 1rem' }}>Changes</h1>
      <Banner tone="idle" title="Release changes are not available yet">
        <p style={{ margin: '0.25rem 0 0' }}>
          Changes show what was added, updated or removed since the previous release. That comparison is not built yet, so nothing is shown rather than guessed.
        </p>
      </Banner>
    </>
  );
}
