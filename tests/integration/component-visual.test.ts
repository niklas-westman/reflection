import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import { createArtifactStore } from '../../src/core/artifact-store.js';
import { runComponentVisualContract } from '../../src/contracts/component/component-visual-contract.js';
import type { ManagedServer } from '../../src/core/server-manager.js';

const activeServers: Array<Server | ManagedServer> = [];

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

async function stopServer(server: Server | ManagedServer): Promise<void> {
  if ('stop' in server) {
    await server.stop();
    return;
  }

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
      }
    }
  });
}

function componentHtml(color: string): string {
  return `<!doctype html>
<html>
<head>
  <style>
    html, body { margin: 0; width: 390px; height: 220px; background: #0b1020; }
    #storybook-root { width: 390px; height: 220px; display: grid; place-items: center; }
    button { width: 180px; height: 56px; border: 0; border-radius: 12px; background: ${color}; color: white; font: 700 18px system-ui; }
  </style>
</head>
<body><div id="storybook-root"><button>Primary</button></div></body>
</html>`;
}

async function startStorybookFixture(color = '#375dfb'): Promise<string> {
  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const server = await startFixtureServer(port, (request, response) => {
    if (request.url === '/index.json') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(storybookIndexResponse());
      return;
    }

    if (request.url === '/iframe.html?id=button--primary') {
      response.writeHead(200, { 'content-type': 'text/html' });
      response.end(componentHtml(color));
      return;
    }

    response.writeHead(404);
    response.end('not found');
  });
  activeServers.push(server);
  return baseUrl;
}

async function captureBaseline(baseUrl: string, baselinePath: string): Promise<void> {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      viewport: { width: 390, height: 220 },
      deviceScaleFactor: 1,
      locale: 'en-US',
      timezoneId: 'Europe/Stockholm',
      colorScheme: 'light'
    });
    const page = await context.newPage();
    await page.goto(`${baseUrl}/iframe.html?id=button--primary`, { waitUntil: 'domcontentloaded' });
    await page.screenshot({ path: baselinePath });
    await context.close();
  } finally {
    await browser.close();
  }
}

async function writeSolidPng(path: string, width: number, height: number, rgba: [number, number, number, number]): Promise<void> {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (width * y + x) << 2;
      png.data[idx] = rgba[0];
      png.data[idx + 1] = rgba[1];
      png.data[idx + 2] = rgba[2];
      png.data[idx + 3] = rgba[3];
    }
  }
  await import('node:fs/promises').then(({ writeFile }) => writeFile(path, PNG.sync.write(png)));
}

afterEach(async () => {
  while (activeServers.length > 0) {
    const server = activeServers.pop();
    if (server) {
      await stopServer(server);
    }
  }
});

describe('component visual contract', () => {
  it('captures a Storybook button story and produces expected, actual, and diff artifacts as review-only by default', async () => {
    const baseUrl = await startStorybookFixture();
    const rootDir = await mkdtemp(join(tmpdir(), 'reflection-component-visual-'));
    const baselineRoot = await mkdtemp(join(tmpdir(), 'reflection-component-baseline-'));
    const baseline = 'components/button-primary.png';
    await import('node:fs/promises').then(({ mkdir }) => mkdir(join(baselineRoot, 'components'), { recursive: true }));
    await captureBaseline(baseUrl, join(baselineRoot, baseline));
    const store = await createArtifactStore({ rootDir, runId: 'component-visual-pass' });

    const checks = await runComponentVisualContract(
      {
        storybook: {
          command: 'node -e "process.exit(42)"',
          readyUrl: baseUrl,
          reuseExisting: true,
          timeoutMs: 1_000
        },
        cases: [
          {
            id: 'button-primary',
            storyId: 'button--primary',
            viewport: 'component',
            baselineRoot,
            baseline,
            threshold: { maxDiffPixelRatio: 0 }
          }
        ]
      },
      store
    );

    const visualCheck = checks.find((check) => check.id === 'visual.button-primary');
    expect(visualCheck).toMatchObject({
      suite: 'visual',
      target: 'button--primary component',
      status: 'pass',
      severity: 'review',
      metadata: {
        classification: 'visual-match',
        storyId: 'button--primary',
        viewport: 'component',
        baselinePath: baseline,
        storyUrl: `${baseUrl}/iframe.html?id=button--primary`
      }
    });
    expect(visualCheck?.artifacts.map((artifact) => [artifact.role, artifact.path])).toEqual([
      ['expected', 'visual/button-primary/expected.png'],
      ['actual', 'visual/button-primary/actual.png'],
      ['diff', 'visual/button-primary/diff.png']
    ]);

    for (const artifact of visualCheck?.artifacts ?? []) {
      await expect(readFile(store.resolveRunPath(artifact.path))).resolves.toBeInstanceOf(Buffer);
    }
  }, 20_000);

  it('makes a strict component visual difference blocking', async () => {
    const baseUrl = await startStorybookFixture();
    const rootDir = await mkdtemp(join(tmpdir(), 'reflection-component-visual-strict-'));
    const baselineRoot = await mkdtemp(join(tmpdir(), 'reflection-component-baseline-strict-'));
    const baseline = 'components/button-primary.png';
    await import('node:fs/promises').then(({ mkdir }) => mkdir(join(baselineRoot, 'components'), { recursive: true }));
    await writeSolidPng(join(baselineRoot, baseline), 390, 220, [255, 0, 0, 255]);
    const store = await createArtifactStore({ rootDir, runId: 'component-visual-strict' });

    const checks = await runComponentVisualContract(
      {
        storybook: {
          command: 'node -e "process.exit(42)"',
          readyUrl: baseUrl,
          reuseExisting: true,
          timeoutMs: 1_000
        },
        cases: [
          {
            id: 'button-primary-strict',
            storyId: 'button--primary',
            viewport: 'component',
            baselineRoot,
            baseline,
            threshold: { maxDiffPixelRatio: 0 },
            strict: true
          }
        ]
      },
      store
    );

    expect(checks.find((check) => check.id === 'visual.button-primary-strict')).toMatchObject({
      status: 'fail',
      severity: 'blocking',
      metadata: {
        classification: 'visual-diff',
        storyId: 'button--primary'
      }
    });
  }, 20_000);
});
