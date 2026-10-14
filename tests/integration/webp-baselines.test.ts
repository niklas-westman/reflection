import { mkdir, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { updateCommand } from '../../src/commands/update.js';
import { runBrowserContract } from '../../src/contracts/browser/browser-contract.js';
import { comparePngImages } from '../../src/contracts/visual/image-diff.js';
import { detectImageFormat, promoteBaselineImage, readBaselineAsPngBuffer, readImage, UnsupportedImageFormatError } from '../../src/contracts/visual/image-io.js';
import { createArtifactStore } from '../../src/core/artifact-store.js';
import { createReport, type CheckResult } from '../../src/core/report-schema.js';
import { startManagedServer, type ManagedServer } from '../../src/core/server-manager.js';

const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

async function makeTempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'reflection-webp-'));
}

// A gradient with a hard edge: lossless WebP must round-trip it exactly, lossy WebP visibly does not.
async function createTestPng(width = 64, height = 48, tweakPixel = false): Promise<Buffer> {
  const channels = 4;
  const data = Buffer.alloc(width * height * channels);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * channels;
      data[offset] = (x * 255) / width;
      data[offset + 1] = x > width / 2 ? 255 : (y * 255) / height;
      data[offset + 2] = (x * 7 + y * 13) % 256;
      data[offset + 3] = 255;
    }
  }
  if (tweakPixel) {
    data[0] = 255 - data[0];
    data[1] = 255 - data[1];
  }
  return sharp(data, { raw: { width, height, channels } }).png().toBuffer();
}

async function writeFiles(dir: string, files: Record<string, Buffer>): Promise<Record<string, string>> {
  const paths: Record<string, string> = {};
  for (const [name, content] of Object.entries(files)) {
    paths[name] = join(dir, name);
    await mkdir(dirname(paths[name]), { recursive: true });
    await writeFile(paths[name], content);
  }
  return paths;
}

describe('image format detection and decoding', () => {
  it('detects PNG, lossless WebP and lossy WebP from the file header', async () => {
    const png = await createTestPng();

    expect(detectImageFormat(png)).toBe('png');
    expect(detectImageFormat(await sharp(png).webp({ lossless: true }).toBuffer())).toBe('webp-lossless');
    expect(detectImageFormat(await sharp(png).webp({ quality: 80 }).toBuffer())).toBe('webp-lossy');
    expect(detectImageFormat(Buffer.from('not an image at all'))).toBeUndefined();
  });

  it('decodes a lossless WebP to exactly the pixels of the source PNG', async () => {
    const dir = await makeTempDir();
    const png = await createTestPng();
    const { 'a.png': pngPath, 'a.webp': webpPath } = await writeFiles(dir, {
      'a.png': png,
      'a.webp': await sharp(png).webp({ lossless: true }).toBuffer()
    });

    const fromPng = await readImage(pngPath as string);
    const fromWebp = await readImage(webpPath as string);

    expect(fromWebp.format).toBe('webp-lossless');
    expect([fromWebp.image.width, fromWebp.image.height]).toEqual([64, 48]);
    expect(fromWebp.image.data.equals(fromPng.image.data)).toBe(true);
  });

  it('decodes by header, so a WebP with a .png extension still works', async () => {
    const dir = await makeTempDir();
    const { 'mislabelled.png': path } = await writeFiles(dir, { 'mislabelled.png': await sharp(await createTestPng()).webp({ lossless: true }).toBuffer() });

    expect((await readImage(path as string)).format).toBe('webp-lossless');
  });

  it('rejects unsupported formats with a typed error', async () => {
    const dir = await makeTempDir();
    const { 'x.png': path } = await writeFiles(dir, { 'x.png': Buffer.from('LOGIN-ACTUAL') });

    await expect(readImage(path as string)).rejects.toBeInstanceOf(UnsupportedImageFormatError);
  });

  it('re-encodes a WebP baseline as PNG for report artifacts and keeps PNG bytes untouched', async () => {
    const dir = await makeTempDir();
    const png = await createTestPng();
    const { 'a.png': pngPath, 'a.webp': webpPath } = await writeFiles(dir, { 'a.png': png, 'a.webp': await sharp(png).webp({ lossless: true }).toBuffer() });

    const fromWebp = await readBaselineAsPngBuffer(webpPath as string);
    const fromPng = await readBaselineAsPngBuffer(pngPath as string);

    expect(fromWebp.png.subarray(0, 4).equals(pngSignature)).toBe(true);
    expect(fromWebp.format).toBe('webp-lossless');
    expect(fromPng.png.equals(png)).toBe(true);
  });
});

describe('comparing against WebP baselines', () => {
  it('matches a lossless WebP baseline against the same screenshot', async () => {
    const dir = await makeTempDir();
    const png = await createTestPng();
    const paths = await writeFiles(dir, { 'actual.png': png, 'expected.webp': await sharp(png).webp({ lossless: true }).toBuffer() });

    const result = await comparePngImages({ expectedPath: paths['expected.webp'] as string, actualPath: paths['actual.png'] as string, threshold: { maxDiffPixels: 0 } });

    expect(result).toMatchObject({ status: 'pass', classification: 'visual-match', diffPixels: 0, expectedFormat: 'webp-lossless' });
  });

  it('reports a real difference against a lossless WebP baseline and writes a diff image', async () => {
    const dir = await makeTempDir();
    const paths = await writeFiles(dir, {
      'actual.png': await createTestPng(64, 48, true),
      'expected.webp': await sharp(await createTestPng()).webp({ lossless: true }).toBuffer()
    });
    const diffPath = join(dir, 'diff.png');

    const result = await comparePngImages({ expectedPath: paths['expected.webp'] as string, actualPath: paths['actual.png'] as string, diffPath });

    expect(result).toMatchObject({ classification: 'visual-diff', dimensionMismatch: false, expectedFormat: 'webp-lossless' });
    expect(result.diffPixels).toBeGreaterThan(0);
    expect((await readFile(diffPath)).subarray(0, 4).equals(pngSignature)).toBe(true);
  });

  it('flags a lossy WebP baseline so noise is not mistaken for a UI change', async () => {
    const dir = await makeTempDir();
    const png = await createTestPng();
    const paths = await writeFiles(dir, { 'actual.png': png, 'expected.webp': await sharp(png).webp({ quality: 30 }).toBuffer() });

    const result = await comparePngImages({ expectedPath: paths['expected.webp'] as string, actualPath: paths['actual.png'] as string });

    expect(result.expectedFormat).toBe('webp-lossy');
  });

  it('reports mismatched dimensions against a WebP baseline', async () => {
    const dir = await makeTempDir();
    const paths = await writeFiles(dir, {
      'actual.png': await createTestPng(64, 48),
      'expected.webp': await sharp(await createTestPng(80, 48)).webp({ lossless: true }).toBuffer()
    });

    const result = await comparePngImages({ expectedPath: paths['expected.webp'] as string, actualPath: paths['actual.png'] as string });

    expect(result).toMatchObject({ classification: 'visual-dimension-mismatch', expected: { width: 80, height: 48 }, actual: { width: 64, height: 48 } });
  });
});

describe('promoting baselines', () => {
  it('writes a lossless WebP for a .webp destination that decodes to the actual pixels', async () => {
    const dir = await makeTempDir();
    const paths = await writeFiles(dir, { 'actual.png': await createTestPng() });
    const destination = join(dir, 'baselines/page.webp');
    await mkdir(dirname(destination), { recursive: true });

    await promoteBaselineImage(paths['actual.png'] as string, destination);

    const promoted = await readImage(destination);
    const original = await readImage(paths['actual.png'] as string);
    expect(promoted.format).toBe('webp-lossless');
    expect(promoted.image.data.equals(original.image.data)).toBe(true);
  });

  it('copies PNG bytes unchanged for a .png destination', async () => {
    const dir = await makeTempDir();
    const png = await createTestPng();
    const paths = await writeFiles(dir, { 'actual.png': png });
    const destination = join(dir, 'page.png');

    await promoteBaselineImage(paths['actual.png'] as string, destination);

    expect((await readFile(destination)).equals(png)).toBe(true);
  });

  it('stores a flat UI-like screenshot far smaller as lossless WebP than as PNG', async () => {
    const dir = await makeTempDir();
    const flat = await sharp({ create: { width: 1512, height: 982, channels: 4, background: '#0d1117' } })
      .composite([{ input: await sharp({ create: { width: 420, height: 320, channels: 4, background: '#8ddcff' } }).png().toBuffer(), left: 500, top: 300 }])
      .png({ compressionLevel: 9 })
      .toBuffer();
    const paths = await writeFiles(dir, { 'actual.png': flat });
    const destination = join(dir, 'page.webp');

    await promoteBaselineImage(paths['actual.png'] as string, destination);

    expect((await stat(destination)).size).toBeLessThan(flat.length);
  });
});

describe('reflection update with WebP baselines', () => {
  it('promotes the actual screenshot into a .webp baseline path as lossless WebP', async () => {
    const root = await makeTempDir();
    const reportRoot = join(root, 'artifacts');
    const baselineRoot = join(root, 'baselines');
    const png = await createTestPng();
    const runDir = join(reportRoot, 'runs', 'webp-run');
    await mkdir(join(runDir, 'visual/login-design'), { recursive: true });
    await writeFile(join(runDir, 'visual/login-design/actual.png'), png);
    const check: CheckResult = {
      id: 'visual.login-design',
      suite: 'visual',
      target: 'login design',
      status: 'warn',
      severity: 'review',
      summary: 'login-design changed.',
      artifacts: [{ type: 'image', role: 'actual', path: 'visual/login-design/actual.png' }],
      metadata: { classification: 'visual-diff', routeId: 'login', viewport: 'desktop', baselinePath: 'login-page/design.webp' }
    };
    const report = createReport({
      runId: 'webp-run',
      project: 'webp-fixture',
      startedAt: new Date('2026-10-14T12:00:00.000Z'),
      finishedAt: new Date('2026-10-14T12:00:01.000Z'),
      mode: 'smoke',
      ci: false,
      checks: [check]
    });
    await writeFile(join(runDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    await writeFile(join(reportRoot, 'runs', 'latest'), 'webp-run\n', 'utf8');
    const configPath = join(root, 'reflection.config.mjs');
    await writeFile(
      configPath,
      `export default { project: 'webp-fixture', contracts: { browser: { baseUrl: 'http://127.0.0.1:4173', routes: [], visualSmoke: [
        { id: 'login-design', route: 'login', viewport: 'desktop', baselineRoot: ${JSON.stringify(baselineRoot)}, baseline: 'login-page/design.webp' }
      ] } } };\n`,
      'utf8'
    );
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const previousCi = process.env.CI;
    delete process.env.CI;

    try {
      await updateCommand({ config: configPath, reportDir: reportRoot, fromRun: 'webp-run', case: 'login-design' });
    } finally {
      vi.restoreAllMocks();
      if (previousCi !== undefined) {
        process.env.CI = previousCi;
      }
    }

    const promoted = await readImage(join(baselineRoot, 'login-page/design.webp'));
    expect(promoted.format).toBe('webp-lossless');
    expect(promoted.image.data.equals((await readImage(join(runDir, 'visual/login-design/actual.png'))).image.data)).toBe(true);
  });
});

describe('route visual smoke with a WebP baseline', () => {
  let server: ManagedServer | undefined;
  let baseUrl = '';

  beforeAll(async () => {
    const port = await new Promise<number>((resolvePort, reject) => {
      const probe = createServer();
      probe.once('error', reject);
      probe.listen(0, '127.0.0.1', () => {
        const address = probe.address();
        probe.close(() => (typeof address === 'object' && address ? resolvePort(address.port) : reject(new Error('no port'))));
      });
    });
    baseUrl = `http://127.0.0.1:${port}`;
    server = await startManagedServer(
      { command: `pnpm dev --host 127.0.0.1 --port ${port}`, readyUrl: baseUrl, reuseExisting: false, timeoutMs: 15_000 },
      { cwd: join(process.cwd(), 'examples/basic-react'), logPath: join(tmpdir(), `reflection-webp-${Date.now()}.log`) }
    );
  });

  afterAll(async () => {
    await server?.stop();
  });

  it('compares a real screenshot with its lossless WebP baseline and keeps report artifacts as PNG', async () => {
    const rootDir = await makeTempDir();
    const routes = [{ id: 'login', path: '/login', viewports: [{ name: 'design-1512', width: 1512, height: 982 }], expects: [{ screenshot: 'final' }] }];
    const seedStore = await createArtifactStore({ rootDir, runId: 'webp-seed' });
    await runBrowserContract({ baseUrl, blocking: true, routes }, seedStore);
    const baselineRoot = join(rootDir, 'references');
    await mkdir(join(baselineRoot, 'login-page'), { recursive: true });
    const seededPng = await readFile(seedStore.resolveRunPath('browser/login/design-1512/actual.png'));
    await promoteBaselineImage(seedStore.resolveRunPath('browser/login/design-1512/actual.png'), join(baselineRoot, 'login-page/design.webp'));

    const store = await createArtifactStore({ rootDir, runId: 'webp-compare' });
    const result = await runBrowserContract(
      {
        baseUrl,
        blocking: true,
        routes,
        visualSmoke: [{ id: 'login-design', route: 'login', viewport: 'design-1512', baselineRoot, baseline: 'login-page/design.webp', strict: true }]
      },
      store
    );

    const visual = result.checks.find((check) => check.id === 'visual.login-design');
    expect(visual).toMatchObject({ status: 'pass', metadata: { classification: 'visual-match', expectedFormat: 'webp-lossless', width: 1512, height: 982 } });
    const expectedArtifact = visual?.artifacts.find((artifact) => artifact.role === 'expected');
    expect(expectedArtifact?.path).toBe('visual/login-design/expected.png');
    expect(detectImageFormat(await readFile(store.resolveRunPath('visual/login-design/expected.png')))).toBe('png');
    expect(seededPng.length).toBeGreaterThan(0);
  }, 40_000);
});
