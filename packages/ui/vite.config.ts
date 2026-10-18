import react from '@vitejs/plugin-react';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { readdir, stat } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import { BundleFileMissingError } from 'reflection-projection';
import { createDirectorySource } from 'reflection-projection/node';

const CONTENT_TYPES: Record<string, string> = {
  '.json': 'application/json',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif'
};

/**
 * Local-only: serves a folder of bundles at /bundles/ and lists them at /bundles/index.json.
 * Files go through the same directory reader the bundle tests use, so paths cannot leave a bundle.
 * The deployed portal replaces this with its own index (a later phase).
 */
function localBundles(directory: string): Plugin {
  const root = resolve(directory);

  async function listBundleIds(): Promise<string[]> {
    const names = await readdir(root).catch(() => [] as string[]);
    const ids: string[] = [];
    for (const name of names.sort()) {
      const hasManifest = await stat(join(root, name, 'manifest.json')).then((stats) => stats.isFile(), () => false);
      if (hasManifest) {
        ids.push(name);
      }
    }
    return ids;
  }

  async function handle(request: IncomingMessage, response: ServerResponse, next: () => void): Promise<void> {
    const url = new URL(request.url ?? '/', 'http://localhost');
    if (url.pathname === '/index.json') {
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ bundles: (await listBundleIds()).map((id) => ({ id })) }));
      return;
    }

    const [bundleId, ...rest] = decodeURIComponent(url.pathname.slice(1)).split('/');
    if (!bundleId || bundleId.startsWith('.') || rest.length === 0) {
      next();
      return;
    }
    try {
      const bytes = await createDirectorySource(join(root, bundleId)).read(rest.join('/'));
      response.setHeader('content-type', CONTENT_TYPES[extname(rest.join('/')).toLowerCase()] ?? 'application/octet-stream');
      response.setHeader('cache-control', 'no-store');
      response.end(bytes);
    } catch (error) {
      response.statusCode = error instanceof BundleFileMissingError ? 404 : 400;
      response.end();
    }
  }

  return {
    name: 'reflection-local-bundles',
    configureServer(server) {
      server.middlewares.use('/bundles', (request, response, next) => void handle(request, response, next));
    },
    configurePreviewServer(server) {
      server.middlewares.use('/bundles', (request, response, next) => void handle(request, response, next));
    }
  };
}

export default defineConfig({
  // Relative asset URLs, so the built app works from any path on a static host.
  base: './',
  plugins: [react(), localBundles(process.env.REFLECTION_BUNDLES_DIR ?? '.demo-bundles')]
});
