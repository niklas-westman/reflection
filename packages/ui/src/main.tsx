import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app';
import { createHttpCatalog } from './data/bundle-catalog';
import { createAppRouter } from './router';
import { applyColorScheme, readColorScheme } from './theme/color-scheme';

applyColorScheme(readColorScheme());

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
