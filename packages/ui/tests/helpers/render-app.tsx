import { createMemoryHistory } from '@tanstack/react-router';
import { render } from '@testing-library/react';
import { App } from '../../src/app';
import type { BundleCatalog } from '../../src/data/bundle-catalog';
import { createAppRouter } from '../../src/router';

export function renderApp(catalog: BundleCatalog, path: string): void {
  render(<App catalog={catalog} router={createAppRouter(createMemoryHistory({ initialEntries: [path] }))} />);
}
