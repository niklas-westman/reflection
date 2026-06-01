import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadStorybookIndex } from '../../src/integrations/storybook/index-json.js';
import { resolveStoryUrl } from '../../src/integrations/storybook/story-url.js';
import { startStorybookServer } from '../../src/integrations/storybook/server.js';

const activeStops: Array<() => Promise<void>> = [];

async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('Failed to allocate a TCP port')));
        return;
      }

      const { port } = address;
      server.close(() => resolve(port));
    });
  });
}

async function startFixtureServer(port: number, handler: (request: IncomingMessage, response: ServerResponse) => void): Promise<Server> {
  const server = createServer(handler);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  return server;
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

function storybookIndexResponse(): string {
  return JSON.stringify({
    v: 5,
    entries: {
      'button--primary': {
        id: 'button--primary',
        title: 'Components/Button',
        name: 'Primary',
        type: 'story',
        importPath: './button.stories.tsx'
      },
      'card--default': {
        id: 'card--default',
        title: 'Components/Card',
        name: 'Default',
        type: 'story',
        importPath: './card.stories.tsx'
      },
      'docs--intro': {
        id: 'docs--intro',
        title: 'Docs/Intro',
        name: 'Docs',
        type: 'docs',
        importPath: './intro.mdx'
      }
    }
  });
}

afterEach(async () => {
  while (activeStops.length > 0) {
    const stop = activeStops.pop();
    if (stop) {
      await stop();
    }
  }
});

describe('storybook index lookup', () => {
  it('loads /index.json and resolves a story id to the iframe story URL', async () => {
    const port = await getFreePort();
    const baseUrl = `http://127.0.0.1:${port}`;
    const server = await startFixtureServer(port, (request, response) => {
      if (request.url === '/index.json') {
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(storybookIndexResponse());
        return;
      }

      response.writeHead(404);
      response.end('not found');
    });
    activeStops.push(() => closeServer(server));

    const index = await loadStorybookIndex(baseUrl);
    const storyUrl = resolveStoryUrl(index, baseUrl, 'button--primary');

    expect(storyUrl).toBe(`${baseUrl}/iframe.html?id=button--primary`);
  });

  it('preserves a configured Storybook base path when loading index and building iframe URLs', async () => {
    const port = await getFreePort();
    const origin = `http://127.0.0.1:${port}`;
    const baseUrl = `${origin}/storybook/`;
    const server = await startFixtureServer(port, (request, response) => {
      if (request.url === '/storybook/index.json') {
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(storybookIndexResponse());
        return;
      }

      response.writeHead(404);
      response.end('not found');
    });
    activeStops.push(() => closeServer(server));

    const index = await loadStorybookIndex(baseUrl);
    const storyUrl = resolveStoryUrl(index, baseUrl, 'button--primary');

    expect(storyUrl).toBe(`${origin}/storybook/iframe.html?id=button--primary`);
  });

  it('throws a clear setup/config error when a story id is missing', async () => {
    const port = await getFreePort();
    const baseUrl = `http://127.0.0.1:${port}`;
    const server = await startFixtureServer(port, (request, response) => {
      if (request.url === '/index.json') {
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(storybookIndexResponse());
        return;
      }

      response.writeHead(404);
      response.end('not found');
    });
    activeStops.push(() => closeServer(server));

    const index = await loadStorybookIndex(baseUrl);

    expect(() => resolveStoryUrl(index, baseUrl, 'missing--story')).toThrow(
      /Reflection Storybook setup\/config error: storyId "missing--story" was not found or is not a story in .*\/index\.json/i
    );
  });

  it('reuses an already reachable Storybook server and resolves stories through it', async () => {
    const port = await getFreePort();
    const baseUrl = `http://127.0.0.1:${port}`;
    const existingServer = await startFixtureServer(port, (request, response) => {
      if (request.url === '/index.json') {
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(storybookIndexResponse());
        return;
      }

      response.writeHead(200, { 'content-type': 'text/plain' });
      response.end('existing storybook');
    });
    activeStops.push(() => closeServer(existingServer));

    const storybook = await startStorybookServer({
      command: 'node -e "process.exit(42)"',
      readyUrl: baseUrl,
      reuseExisting: true,
      timeoutMs: 1_000
    });

    expect(storybook.server.reused).toBe(true);
    expect(storybook.server.started).toBe(false);
    expect(resolveStoryUrl(storybook.index, storybook.baseUrl, 'card--default')).toBe(`${baseUrl}/iframe.html?id=card--default`);
  });

  it('starts a configured Storybook command, waits for /index.json, and writes server logs', async () => {
    const port = await getFreePort();
    const baseUrl = `http://127.0.0.1:${port}`;
    const workdir = await mkdtemp(join(tmpdir(), 'reflection-storybook-'));
    const logPath = join(workdir, 'storybook.log');
    const indexJson = storybookIndexResponse();
    const command = `node -e ${JSON.stringify(
      `const http = require('node:http'); const index = ${JSON.stringify(
        indexJson
      )}; const server = http.createServer((request, response) => { if (request.url === '/index.json') { response.writeHead(200, { 'content-type': 'application/json' }); response.end(index); return; } response.writeHead(200, { 'content-type': 'text/html' }); response.end('<div id="storybook-root"></div>'); }); server.listen(${port}, '127.0.0.1', () => console.log('storybook fixture ready')); setInterval(() => {}, 1000);`
    )}`;

    const storybook = await startStorybookServer(
      {
        command,
        readyUrl: baseUrl,
        reuseExisting: false,
        timeoutMs: 5_000
      },
      { cwd: workdir, logPath }
    );
    activeStops.push(storybook.server.stop);

    expect(storybook.server.started).toBe(true);
    expect(storybook.server.reused).toBe(false);
    expect(resolveStoryUrl(storybook.index, storybook.baseUrl, 'button--primary')).toBe(`${baseUrl}/iframe.html?id=button--primary`);
    await expect(readFile(logPath, 'utf8')).resolves.toContain('storybook fixture ready');
  });
});
