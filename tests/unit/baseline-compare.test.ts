import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import { createArtifactStore } from '../../src/core/artifact-store.js';
import { compareRouteVisualBaseline } from '../../src/contracts/visual/baseline-compare.js';
import type { CheckResult } from '../../src/core/report-schema.js';

type Rgba = [number, number, number, number];

async function makeTempDir() {
  const dir = join(tmpdir(), `reflection-baseline-compare-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  await mkdir(dir, { recursive: true });
  return dir;
}

async function writePng(path: string, width: number, height: number, pixels: Rgba | Rgba[]) {
  const image = new PNG({ width, height });
  const values = Array.isArray(pixels[0]) ? (pixels as Rgba[]) : Array.from({ length: width * height }, () => pixels as Rgba);

  values.forEach(([red, green, blue, alpha], index) => {
    const offset = index * 4;
    image.data[offset] = red;
    image.data[offset + 1] = green;
    image.data[offset + 2] = blue;
    image.data[offset + 3] = alpha;
  });

  await writeFile(path, PNG.sync.write(image));
}

async function makeRouteCheck(storeRoot: string, runId: string, actualPixels: Rgba | Rgba[], width = 2, height = 2): Promise<{ store: Awaited<ReturnType<typeof createArtifactStore>>; routeCheck: CheckResult }> {
  const store = await createArtifactStore({ rootDir: storeRoot, runId });
  const actualPath = 'browser/login/mobile/actual.png';
  const absoluteActualPath = store.resolveRunPath(actualPath);
  await mkdir(join(absoluteActualPath, '..'), { recursive: true });
  await writePng(absoluteActualPath, width, height, actualPixels);
  const actualArtifact = await store.describeArtifact(actualPath, 'screenshot', 'actual');

  return {
    store,
    routeCheck: {
      id: 'browser.login.mobile',
      suite: 'browser',
      target: '/login mobile',
      status: 'pass',
      severity: 'blocking',
      summary: 'login rendered on mobile.',
      artifacts: [actualArtifact],
      metadata: { route: '/login', routeId: 'login', viewport: 'mobile' }
    }
  };
}

describe('compareRouteVisualBaseline', () => {
  it('returns a failed visual check instead of crashing on dimension mismatch', async () => {
    const dir = await makeTempDir();
    const baselineRoot = join(dir, 'baselines');
    await mkdir(baselineRoot, { recursive: true });
    await writePng(join(baselineRoot, 'login.png'), 3, 2, [0, 0, 0, 255]);
    const { store, routeCheck } = await makeRouteCheck(join(dir, 'artifacts'), 'dimension-mismatch', [0, 0, 0, 255], 2, 2);

    const check = await compareRouteVisualBaseline({
      store,
      routeCheck,
      visualCase: {
        id: 'login-mobile',
        route: 'login',
        viewport: 'mobile',
        baselineRoot,
        baseline: 'login.png',
        threshold: { maxDiffPixelRatio: 0.01 }
      }
    });

    expect(check).toMatchObject({
      id: 'visual.login-mobile',
      status: 'fail',
      severity: 'review',
      metadata: {
        classification: 'visual-dimension-mismatch',
        dimensionMismatch: true
      }
    });
    expect(check.artifacts.map((artifact) => artifact.role)).toEqual(['expected', 'actual']);
  });

  it('promotes over-threshold visual diffs to blocking failures when the case is blocking', async () => {
    const dir = await makeTempDir();
    const baselineRoot = join(dir, 'baselines');
    await mkdir(baselineRoot, { recursive: true });
    await writePng(join(baselineRoot, 'login.png'), 2, 2, [0, 0, 0, 255]);
    const { store, routeCheck } = await makeRouteCheck(join(dir, 'artifacts'), 'blocking-diff', [
      [255, 255, 255, 255],
      [0, 0, 0, 255],
      [0, 0, 0, 255],
      [0, 0, 0, 255]
    ]);

    const check = await compareRouteVisualBaseline({
      store,
      routeCheck,
      visualCase: {
        id: 'login-mobile',
        route: 'login',
        viewport: 'mobile',
        baselineRoot,
        baseline: 'login.png',
        threshold: { maxDiffPixelRatio: 0.2 },
        blocking: true
      }
    });

    expect(check).toMatchObject({
      status: 'fail',
      severity: 'blocking',
      metadata: {
        classification: 'visual-diff',
        diffPixels: 1,
        diffRatio: 0.25
      }
    });
  });
});
