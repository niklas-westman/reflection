import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import { createArtifactStore } from '../../src/core/artifact-store.js';
import { runComponentVisualContract } from '../../src/contracts/component/component-visual-contract.js';
import type { ManagedServer } from '../../src/core/server-manager.js';

type FixtureViewport = { width: number; height: number };

const activeServers: Array<Server | ManagedServer> = [];
const componentViewport: FixtureViewport = { width: 390, height: 220 };

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

function componentHtml(color: string, hoverColor = color): string {
  return `<!doctype html>
<html>
<head>
  <style>
    html, body { margin: 0; width: 390px; height: 220px; background: #0b1020; }
    #storybook-root { width: 390px; height: 220px; display: grid; place-items: center; }
    button { width: 180px; height: 56px; border: 0; border-radius: 12px; background: ${color}; color: white; font: 700 18px system-ui; }
    button:hover { background: ${hoverColor}; }
  </style>
</head>
<body><div id="storybook-root"><button>Primary</button></div></body>
</html>`;
}

async function startStorybookFixture(color = '#375dfb', hoverColor = color): Promise<string> {
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
      response.end(componentHtml(color, hoverColor));
      return;
    }

    response.writeHead(404);
    response.end('not found');
  });
  activeServers.push(server);
  return baseUrl;
}

async function captureBaseline(baseUrl: string, baselinePath: string, viewport: FixtureViewport = componentViewport): Promise<void> {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      viewport,
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

async function captureHoveredBaseline(baseUrl: string, baselinePath: string, viewport: FixtureViewport = componentViewport): Promise<void> {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      viewport,
      deviceScaleFactor: 1,
      locale: 'en-US',
      timezoneId: 'Europe/Stockholm',
      colorScheme: 'light'
    });
    const page = await context.newPage();
    await page.goto(`${baseUrl}/iframe.html?id=button--primary`, { waitUntil: 'domcontentloaded' });
    await page.locator('button').hover();
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

async function writePortalEntry(path: string, rgba: [number, number, number, number]): Promise<void> {
  await writeFile(
    path,
    `
export function mountReflectionCase(input) {
  input.root.style.width = "100%";
  input.root.style.height = "100%";
  input.root.style.background = "rgba(${rgba[0]}, ${rgba[1]}, ${rgba[2]}, ${rgba[3] / 255})";
  input.root.dataset.caseId = input.id;
}
`,
    'utf8'
  );
}

function readPixel(png: PNG, x: number, y: number): [number, number, number, number] {
  const idx = (png.width * y + x) << 2;
  return [png.data[idx], png.data[idx + 1], png.data[idx + 2], png.data[idx + 3]];
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
            threshold: { maxDiffPixelRatio: 0 },
            stateNote: 'Default state is represented by the Storybook story args/decorators.'
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
        storyUrl: `${baseUrl}/iframe.html?id=button--primary`,
        stateNote: 'Default state is represented by the Storybook story args/decorators.',
        statePolicy: 'story-controlled'
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

  it('captures component visuals with a custom viewport size and stores it in metadata', async () => {
    const baseUrl = await startStorybookFixture();
    const rootDir = await mkdtemp(join(tmpdir(), 'reflection-component-visual-custom-'));
    const baselineRoot = await mkdtemp(join(tmpdir(), 'reflection-component-baseline-custom-'));
    const baseline = 'components/button-primary-custom.png';
    const viewportSize = { width: 320, height: 180 };
    await import('node:fs/promises').then(({ mkdir }) => mkdir(join(baselineRoot, 'components'), { recursive: true }));
    await captureBaseline(baseUrl, join(baselineRoot, baseline), viewportSize);
    const store = await createArtifactStore({ rootDir, runId: 'component-visual-custom' });

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
            id: 'button-primary-custom',
            storyId: 'button--primary',
            viewport: 'button-default',
            viewportSize,
            baselineRoot,
            baseline,
            threshold: { maxDiffPixelRatio: 0 }
          }
        ]
      },
      store
    );

    const visualCheck = checks.find((check) => check.id === 'visual.button-primary-custom');
    expect(visualCheck).toMatchObject({
      target: 'button--primary button-default',
      status: 'pass',
      metadata: {
        classification: 'visual-match',
        viewport: 'button-default',
        viewportSize
      }
    });

    const actualArtifact = visualCheck?.artifacts.find((artifact) => artifact.role === 'actual');
    expect(actualArtifact).toBeDefined();
    const actual = PNG.sync.read(await readFile(store.resolveRunPath(actualArtifact?.path ?? '')));
    expect({ width: actual.width, height: actual.height }).toEqual(viewportSize);
  }, 20_000);

  it('applies component framing before screenshot capture and stores it in metadata', async () => {
    const baseUrl = await startStorybookFixture();
    const rootDir = await mkdtemp(join(tmpdir(), 'reflection-component-visual-framing-'));
    const baselineRoot = await mkdtemp(join(tmpdir(), 'reflection-component-baseline-framing-'));
    const baseline = 'components/button-primary-framed.png';
    const framing = {
      rootSelector: '#storybook-root',
      background: '#ffffff',
      align: 'center' as const,
      padding: 24
    };
    await import('node:fs/promises').then(({ mkdir }) => mkdir(join(baselineRoot, 'components'), { recursive: true }));
    await writeSolidPng(join(baselineRoot, baseline), 390, 220, [255, 255, 255, 255]);
    const store = await createArtifactStore({ rootDir, runId: 'component-visual-framing' });

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
            id: 'button-primary-framing',
            storyId: 'button--primary',
            viewport: 'component',
            baselineRoot,
            baseline,
            framing,
            threshold: { maxDiffPixelRatio: 0 }
          }
        ]
      },
      store
    );

    const visualCheck = checks.find((check) => check.id === 'visual.button-primary-framing');
    expect(visualCheck).toMatchObject({
      status: 'warn',
      metadata: {
        classification: 'visual-diff',
        framing
      }
    });

    const actualArtifact = visualCheck?.artifacts.find((artifact) => artifact.role === 'actual');
    expect(actualArtifact).toBeDefined();
    const actual = PNG.sync.read(await readFile(store.resolveRunPath(actualArtifact?.path ?? '')));
    expect(readPixel(actual, 0, 0)).toEqual([255, 255, 255, 255]);
  }, 20_000);

  it('captures portal component visuals with generated frame dimensions and source metadata', async () => {
    const port = await getFreePort();
    const rootDir = await mkdtemp(join(tmpdir(), 'reflection-component-portal-'));
    const baselineRoot = await mkdtemp(join(tmpdir(), 'reflection-component-portal-baseline-'));
    const entryPath = join(rootDir, 'portal-entry.js');
    const baseline = 'components/button-primary-portal.png';
    const viewportSize = { width: 320, height: 180 };
    const framing = {
      rootSelector: '#reflection-root',
      background: '#0c2238',
      align: 'start' as const,
      padding: 0
    };
    await import('node:fs/promises').then(({ mkdir }) => mkdir(join(baselineRoot, 'components'), { recursive: true }));
    await writePortalEntry(entryPath, [12, 34, 56, 255]);
    await writeSolidPng(join(baselineRoot, baseline), viewportSize.width, viewportSize.height, [12, 34, 56, 255]);
    const store = await createArtifactStore({ rootDir, runId: 'component-visual-portal' });

    const checks = await runComponentVisualContract(
      {
        portal: {
          entry: entryPath,
          readyUrl: `http://127.0.0.1:${port}`,
          reuseExisting: false,
          timeoutMs: 10_000
        },
        cases: [
          {
            id: 'button-primary-portal',
            path: '/reflection/button/primary/light',
            viewport: 'button-default',
            viewportSize,
            baselineRoot,
            baseline,
            framing,
            threshold: { maxDiffPixels: 0, maxDiffPixelRatio: 0 },
            strict: true
          }
        ]
      },
      store
    );

    const visualCheck = checks.find((check) => check.id === 'visual.button-primary-portal');
    expect(visualCheck).toMatchObject({
      target: '/reflection/button/primary/light button-default',
      status: 'pass',
      metadata: {
        classification: 'visual-match',
        componentSource: 'portal',
        path: '/reflection/button/primary/light',
        portalUrl: `http://127.0.0.1:${port}/reflection/button/primary/light`,
        viewport: 'button-default',
        viewportSize,
        framing,
        statePolicy: 'portal-controlled'
      }
    });

    const actualArtifact = visualCheck?.artifacts.find((artifact) => artifact.role === 'actual');
    expect(actualArtifact).toBeDefined();
    const actual = PNG.sync.read(await readFile(store.resolveRunPath(actualArtifact?.path ?? '')));
    expect({ width: actual.width, height: actual.height }).toEqual(viewportSize);
    expect(readPixel(actual, 0, 0)).toEqual([12, 34, 56, 255]);
  }, 30_000);

  it('produces portal expected, actual, and diff artifacts on mismatch', async () => {
    const port = await getFreePort();
    const rootDir = await mkdtemp(join(tmpdir(), 'reflection-component-portal-diff-'));
    const baselineRoot = await mkdtemp(join(tmpdir(), 'reflection-component-portal-baseline-diff-'));
    const entryPath = join(rootDir, 'portal-entry.js');
    const baseline = 'components/button-primary-portal-diff.png';
    const viewportSize = { width: 320, height: 180 };
    await import('node:fs/promises').then(({ mkdir }) => mkdir(join(baselineRoot, 'components'), { recursive: true }));
    await writePortalEntry(entryPath, [12, 34, 56, 255]);
    await writeSolidPng(join(baselineRoot, baseline), viewportSize.width, viewportSize.height, [255, 0, 0, 255]);
    const store = await createArtifactStore({ rootDir, runId: 'component-visual-portal-diff' });

    const checks = await runComponentVisualContract(
      {
        portal: {
          entry: entryPath,
          readyUrl: `http://127.0.0.1:${port}`,
          reuseExisting: false,
          timeoutMs: 10_000
        },
        cases: [
          {
            id: 'button-primary-portal-diff',
            path: '/reflection/button/primary/light',
            viewport: 'button-default',
            viewportSize,
            baselineRoot,
            baseline,
            framing: { background: '#0c2238', align: 'start', padding: 0 },
            threshold: { maxDiffPixels: 0, maxDiffPixelRatio: 0 },
            strict: true
          }
        ]
      },
      store
    );

    const visualCheck = checks.find((check) => check.id === 'visual.button-primary-portal-diff');
    expect(visualCheck).toMatchObject({
      status: 'fail',
      severity: 'blocking',
      metadata: {
        classification: 'visual-diff',
        componentSource: 'portal'
      }
    });
    expect(visualCheck?.artifacts.map((artifact) => [artifact.role, artifact.path])).toEqual([
      ['expected', 'visual/button-primary-portal-diff/expected.png'],
      ['actual', 'visual/button-primary-portal-diff/actual.png'],
      ['diff', 'visual/button-primary-portal-diff/diff.png']
    ]);
  }, 30_000);

  it('fails strict component visuals when the baseline dimensions do not match the custom viewport size', async () => {
    const baseUrl = await startStorybookFixture();
    const rootDir = await mkdtemp(join(tmpdir(), 'reflection-component-visual-size-mismatch-'));
    const baselineRoot = await mkdtemp(join(tmpdir(), 'reflection-component-baseline-size-mismatch-'));
    const baseline = 'components/button-primary-wrong-size.png';
    const viewportSize = { width: 320, height: 180 };
    await import('node:fs/promises').then(({ mkdir }) => mkdir(join(baselineRoot, 'components'), { recursive: true }));
    await captureBaseline(baseUrl, join(baselineRoot, baseline));
    const store = await createArtifactStore({ rootDir, runId: 'component-visual-size-mismatch' });

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
            id: 'button-primary-size-mismatch',
            storyId: 'button--primary',
            viewport: 'button-default',
            viewportSize,
            baselineRoot,
            baseline,
            threshold: { maxDiffPixels: 0, maxDiffPixelRatio: 0 },
            strict: true
          }
        ]
      },
      store
    );

    expect(checks.find((check) => check.id === 'visual.button-primary-size-mismatch')).toMatchObject({
      status: 'fail',
      severity: 'blocking',
      metadata: {
        classification: 'visual-dimension-mismatch',
        viewport: 'button-default',
        viewportSize,
        expected: componentViewport,
        actual: viewportSize
      }
    });
  }, 20_000);

  it('allows browser-forced hover only when animation stabilization is configured', async () => {
    const baseUrl = await startStorybookFixture('#375dfb', '#ad3bff');
    const rootDir = await mkdtemp(join(tmpdir(), 'reflection-component-visual-hover-'));
    const baselineRoot = await mkdtemp(join(tmpdir(), 'reflection-component-baseline-hover-'));
    const baseline = 'components/button-primary-hover.png';
    await import('node:fs/promises').then(({ mkdir }) => mkdir(join(baselineRoot, 'components'), { recursive: true }));
    await captureHoveredBaseline(baseUrl, join(baselineRoot, baseline));
    const store = await createArtifactStore({ rootDir, runId: 'component-visual-hover' });

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
            id: 'button-primary-hover',
            storyId: 'button--primary',
            viewport: 'component',
            baselineRoot,
            baseline,
            threshold: { maxDiffPixelRatio: 0 },
            browserState: {
              kind: 'hover',
              selector: 'button',
              animationStabilization: { disableAnimations: true, waitMs: 0 }
            }
          }
        ]
      },
      store
    );

    expect(checks.find((check) => check.id === 'visual.button-primary-hover')).toMatchObject({
      status: 'pass',
      metadata: {
        classification: 'visual-match',
        statePolicy: 'browser-forced-with-stabilization',
        browserState: {
          kind: 'hover',
          selector: 'button',
          animationStabilization: { disableAnimations: true, waitMs: 0 }
        }
      }
    });
  }, 20_000);

  it('preserves state policy metadata when a component baseline is missing', async () => {
    const baseUrl = await startStorybookFixture();
    const rootDir = await mkdtemp(join(tmpdir(), 'reflection-component-visual-missing-'));
    const baselineRoot = await mkdtemp(join(tmpdir(), 'reflection-component-baseline-missing-'));
    const store = await createArtifactStore({ rootDir, runId: 'component-visual-missing' });

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
            id: 'button-primary-missing',
            storyId: 'button--primary',
            viewport: 'component',
            baselineRoot,
            baseline: 'components/missing.png',
            stateNote: 'Missing baseline still needs to explain the intended story state.',
            browserState: {
              kind: 'focus',
              selector: 'button',
              animationStabilization: { disableAnimations: true, waitMs: 0 }
            }
          }
        ]
      },
      store
    );

    expect(checks.find((check) => check.id === 'visual.button-primary-missing')).toMatchObject({
      status: 'warn',
      metadata: {
        classification: 'missing-baseline',
        stateNote: 'Missing baseline still needs to explain the intended story state.',
        statePolicy: 'browser-forced-with-stabilization',
        browserState: {
          kind: 'focus',
          selector: 'button',
          animationStabilization: { disableAnimations: true, waitMs: 0 }
        }
      }
    });
  }, 20_000);
});
