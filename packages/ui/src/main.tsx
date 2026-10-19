import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app';
import { createHttpCatalog } from './data/bundle-catalog';
import { createAppRouter, hashRouteForPlainPath } from './router';
import { applyColorScheme, readColorScheme } from './theme/color-scheme';

applyColorScheme(readColorScheme());

const plainPathRoute = hashRouteForPlainPath(window.location.pathname, window.location.hash, new URL(import.meta.env.BASE_URL, window.location.origin).pathname);
if (plainPathRoute) {
  window.location.replace(plainPathRoute);
} else {
  const catalog = createHttpCatalog(new URL('bundles', document.baseURI).toString());
  const root = document.getElementById('root');
  if (!root) {
    throw new Error('index.html has no #root element');
  }
  createRoot(root).render(
    <StrictMode>
      <App catalog={catalog} router={createAppRouter()} />
    </StrictMode>
  );
}
