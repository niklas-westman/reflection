import { chmod, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createArtifactStore } from '../../src/core/artifact-store.js';
import { startManagedServer, type ManagedServer } from '../../src/core/server-manager.js';
import { runPrintContract } from '../../src/contracts/print/print-contract.js';

const activeServers: ManagedServer[] = [];

async function startBasicReactFixture(): Promise<string> {
  const port = await getFreePort();
  const readyUrl = `http://127.0.0.1:${port}`;
  const server = await startManagedServer(
    {
      command: `pnpm dev --host 127.0.0.1 --port ${port}`,
      readyUrl,
      reuseExisting: false,
      timeoutMs: 10_000
    },
    {
      cwd: join(process.cwd(), 'examples/basic-react'),
      logPath: join(tmpdir(), `reflection-print-contract-${Date.now()}.log`)
    }
  );
  activeServers.push(server);
  return readyUrl;
}

async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => {
        if (address && typeof address === 'object') {
          resolve(address.port);
          return;
        }

        reject(new Error('Unable to allocate a free local port.'));
      });
    });
  });
}

afterEach(async () => {
  while (activeServers.length > 0) {
    const server = activeServers.pop();
    if (server) {
      await server.stop();
    }
  }
});

describe('print contract', () => {
  it('creates a PDF and warns when optional Poppler tools are missing', async () => {
    const baseUrl = await startBasicReactFixture();
    const previousPath = process.env.PATH;
    process.env.PATH = await mkdtemp(join(tmpdir(), 'reflection-empty-path-'));
    const rootDir = await mkdtemp(join(tmpdir(), 'reflection-print-optional-'));
    const store = await createArtifactStore({ rootDir, runId: 'print-optional' });

    try {
      const checks = await runPrintContract({
        store,
        browser: { baseUrl, routes: [{ id: 'print-fixture', path: '/print-fixture' }] },
        config: {
          cases: [
            {
              id: 'annual-report-full-smoke',
              route: 'print-fixture',
              viewport: 'desktop',
              blocking: true,
              scenario: 'annual-report-full-smoke',
              pdf: {
                format: 'A4',
                printBackground: true,
                expectedPageCount: 7,
                expectedPageSize: 'A4',
                poppler: { mode: 'optional', dpi: 144 },
                renderedPages: [{ id: 'annual-report-page-7', page: 7, baseline: 'print/page-7.png' }]
              }
            }
          ]
        }
      });

      expect(checks.find((check) => check.id === 'print.annual-report-full-smoke.pdf')).toMatchObject({
        status: 'pass',
        artifacts: [{ type: 'pdf', path: 'print/annual-report-full-smoke/document.pdf' }]
      });
      expect(checks.find((check) => check.id === 'print.annual-report-full-smoke.poppler')).toMatchObject({
        status: 'warn',
        severity: 'review',
        metadata: { classification: 'missing-poppler', scenario: 'annual-report-full-smoke' }
      });
      await expect(readFile(store.resolveRunPath('print/annual-report-full-smoke/document.pdf'))).resolves.toBeInstanceOf(Buffer);
    } finally {
      process.env.PATH = previousPath;
    }
  }, 20_000);

  it('renders configured PDF pages with Poppler and exposes missing print baselines', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'reflection-print-poppler-'));
    const fakeBin = join(rootDir, 'bin');
    await mkdir(fakeBin, { recursive: true });
    await writeFakePoppler(fakeBin);
    const previousPath = process.env.PATH;
    process.env.PATH = `${fakeBin}:${previousPath ?? ''}`;
    const baseUrl = await startBasicReactFixture();
    const store = await createArtifactStore({ rootDir: join(rootDir, 'artifacts'), runId: 'print-poppler' });

    try {
      const checks = await runPrintContract({
        store,
        browser: { baseUrl, routes: [{ id: 'print-fixture', path: '/print-fixture' }] },
        config: {
          cases: [
            {
              id: 'annual-report-full-smoke',
              route: 'print-fixture',
              viewport: 'desktop',
              blocking: true,
              scenario: 'annual-report-full-smoke',
              pdf: {
                format: 'A4',
                printBackground: true,
                expectedPageCount: 7,
                expectedPageSize: 'A4',
                poppler: { mode: 'optional', dpi: 144 },
                renderedPages: [
                  {
                    id: 'annual-report-page-7',
                    page: 7,
                    baselineRoot: join(rootDir, 'baselines'),
                    baseline: 'print/page-7.png'
                  }
                ]
              }
            }
          ]
        }
      });

      expect(checks.find((check) => check.id === 'print.annual-report-full-smoke.pdf-info')).toMatchObject({
        status: 'pass',
        metadata: { pages: 7, pageSize: 'A4' }
      });
      expect(checks.find((check) => check.id === 'print.annual-report-page-7')).toMatchObject({
        suite: 'print',
        status: 'warn',
        severity: 'review',
        metadata: { classification: 'missing-baseline', scenario: 'annual-report-full-smoke' }
      });
      expect(checks.find((check) => check.id === 'print.annual-report-full-smoke.contact-sheet')).toMatchObject({
        status: 'pass',
        artifacts: [{ type: 'contact-sheet' }]
      });
      await expect(readFile(store.resolveRunPath('print/annual-report-full-smoke/pages/page-7.png'))).resolves.toBeInstanceOf(Buffer);
    } finally {
      process.env.PATH = previousPath;
    }
  }, 20_000);
});

async function writeFakePoppler(fakeBin: string): Promise<void> {
  const pngBase64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEUlEQVR4AWP8DwQMQMDEAAUAPfgEADYYS7QAAAAASUVORK5CYII=';
  const pdfinfo = join(fakeBin, 'pdfinfo');
  const pdftoppm = join(fakeBin, 'pdftoppm');
  await writeFile(
    pdfinfo,
    `#!/usr/bin/env node
if (process.argv.includes('-v')) {
  console.error('pdfinfo fake 1.0');
  process.exit(0);
}
console.log('Pages: 7');
console.log('Page size: 595.28 x 841.89 pts (A4)');
`,
    'utf8'
  );
  await writeFile(
    pdftoppm,
    `#!/usr/bin/env node
if (process.argv.includes('-v')) {
  console.error('pdftoppm fake 1.0');
  process.exit(0);
}
const outputPrefix = process.argv[process.argv.length - 1];
require('fs').writeFileSync(outputPrefix + '.png', Buffer.from('${pngBase64}', 'base64'));
`,
    'utf8'
  );
  await Promise.all([chmod(pdfinfo, 0o755), chmod(pdftoppm, 0o755)]);
}
