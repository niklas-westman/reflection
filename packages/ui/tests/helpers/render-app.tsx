import { createMemoryHistory, type AnyRouter } from '@tanstack/react-router';
import { render } from '@testing-library/react';
import { App } from '../../src/app';
import type { BundleCatalog } from '../../src/data/bundle-catalog';
import { createAppRouter } from '../../src/router';

export function renderApp(catalog: BundleCatalog, path: string): AnyRouter {
  const router = createAppRouter(createMemoryHistory({ initialEntries: [path] }));
  render(<App catalog={catalog} router={router} />);
  return router;
}
