import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app';
import { createHttpCatalog } from './data/bundle-catalog';
import { loadViewerConfig } from './data/viewer-config';
import { createAppRouter, hashRouteForPlainPath } from './router';
import { applyColorScheme, readColorScheme } from './theme/color-scheme';

applyColorScheme(readColorScheme());

const root = document.getElementById('root');
if (!root) {
  throw new Error('index.html has no #root element');
}

const plainPathRoute = hashRouteForPlainPath(window.location.pathname, window.location.hash);
if (plainPathRoute) {
  window.location.replace(plainPathRoute);
} else {
  void start(root);
}

async function start(container: HTMLElement): Promise<void> {
  try {
    const config = await loadViewerConfig(document.baseURI);
    createRoot(container).render(
      <StrictMode>
        <App catalog={createHttpCatalog(config.bundlesUrl, { decisionsUrl: config.decisionsUrl })} router={createAppRouter()} />
      </StrictMode>
    );
  } catch (error) {
    // A host's broken configuration is shown as such; the viewer never guesses where the bundles are.
    container.textContent = `The viewer could not start: ${error instanceof Error ? error.message : String(error)}`;
  }
}
