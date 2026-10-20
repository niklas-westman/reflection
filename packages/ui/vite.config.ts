import react from '@vitejs/plugin-react';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { readdir, readFile } from 'node:fs/promises';
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

  // index.json as a host writes it (`releaseIndexSchema`): each bundle's identity from its own manifest, and the
  // most recently built bundle of each project as its latest.
  async function listBundles(): Promise<{ bundles: Array<Record<string, unknown>>; latest: Record<string, string> }> {
    const names = await readdir(root).catch(() => [] as string[]);
    const bundles: Array<{ id: string; project: string; release: string; build: number; state: string; builtAt: string; bundleHash: string }> = [];
    for (const name of names.sort()) {
      const manifest = await readFile(join(root, name, 'manifest.json'), 'utf8').then((text) => JSON.parse(text) as { project: { id: string }; bundleHash: string; release: { release: string; build: number; state: string; builtAt: string } }, () => undefined);
      if (manifest) {
        bundles.push({ id: name, project: manifest.project.id, release: manifest.release.release, build: manifest.release.build, state: manifest.release.state, builtAt: manifest.release.builtAt, bundleHash: manifest.bundleHash });
      }
    }
    const latest: Record<string, string> = {};
    for (const bundle of [...bundles].sort((a, b) => a.builtAt.localeCompare(b.builtAt) || a.id.localeCompare(b.id))) latest[bundle.project] = bundle.id;
    return { bundles, latest };
  }

  // Summaries of releases whose evidence was removed: every .json file in <folder>/archive. Not validated here;
  // the viewer validates them and counts the ones it cannot read.
  async function listArchive(): Promise<unknown[]> {
    const names = await readdir(join(root, 'archive')).catch(() => [] as string[]);
    const summaries: unknown[] = [];
    for (const name of names.filter((entry) => entry.endsWith('.json')).sort()) {
      summaries.push(await readFile(join(root, 'archive', name), 'utf8').then((text) => JSON.parse(text) as unknown, () => null));
    }
    return summaries;
  }

  async function handle(request: IncomingMessage, response: ServerResponse, next: () => void): Promise<void> {
    const url = new URL(request.url ?? '/', 'http://localhost');
    if (url.pathname === '/index.json') {
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ schemaVersion: 1, generatedAt: new Date().toISOString(), ...(await listBundles()), archive: await listArchive() }));
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
