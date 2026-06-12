import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import { comparePngImages } from '../../src/contracts/visual/image-diff.js';
import { evaluateVisualThreshold } from '../../src/contracts/visual/thresholds.js';

type Rgba = [number, number, number, number];

async function makeTempDir() {
  const dir = join(tmpdir(), `reflection-image-diff-${Date.now()}-${Math.random().toString(16).slice(2)}`);
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

describe('comparePngImages', () => {
  it('passes equal PNGs and writes a diff artifact when requested', async () => {
    const dir = await makeTempDir();
    const expectedPath = join(dir, 'expected.png');
    const actualPath = join(dir, 'actual.png');
    const diffPath = join(dir, 'diff.png');
    await writePng(expectedPath, 2, 2, [10, 20, 30, 255]);
    await writePng(actualPath, 2, 2, [10, 20, 30, 255]);

    const result = await comparePngImages({ expectedPath, actualPath, diffPath, threshold: { maxDiffPixelRatio: 0 } });

    expect(result).toMatchObject({
      status: 'pass',
      classification: 'visual-match',
      width: 2,
      height: 2,
      diffPixels: 0,
      diffRatio: 0,
      dimensionMismatch: false,
      diffPath
    });
  });

  it('classifies dimension mismatches separately without writing a diff image', async () => {
    const dir = await makeTempDir();
    const expectedPath = join(dir, 'expected.png');
    const actualPath = join(dir, 'actual.png');
    await writePng(expectedPath, 2, 2, [255, 255, 255, 255]);
    await writePng(actualPath, 3, 2, [255, 255, 255, 255]);

    const result = await comparePngImages({ expectedPath, actualPath, threshold: { maxDiffPixelRatio: 0.01 } });

    expect(result).toMatchObject({
      status: 'fail',
      classification: 'visual-dimension-mismatch',
      dimensionMismatch: true,
      expected: { width: 2, height: 2 },
      actual: { width: 3, height: 2 },
      diagnostics: {
        categories: ['dimension-mismatch'],
        summary: 'Expected 2x2, actual 3x2.'
      }
    });
  });

  it('warns by default when diff exceeds threshold and fails in strict mode', async () => {
    const dir = await makeTempDir();
    const expectedPath = join(dir, 'expected.png');
    const actualPath = join(dir, 'actual.png');
    await writePng(expectedPath, 2, 2, [0, 0, 0, 255]);
    await writePng(actualPath, 2, 2, [
      [255, 255, 255, 255],
      [0, 0, 0, 255],
      [0, 0, 0, 255],
      [0, 0, 0, 255]
    ]);

    const reviewResult = await comparePngImages({ expectedPath, actualPath, threshold: { maxDiffPixelRatio: 0.2 } });
    const strictResult = await comparePngImages({
      expectedPath,
      actualPath,
      threshold: { maxDiffPixelRatio: 0.2 },
      strict: true
    });

    expect(reviewResult).toMatchObject({
      status: 'warn',
      classification: 'visual-diff',
      diffPixels: 1,
      diffRatio: 0.25,
      threshold: { maxDiffPixelRatio: 0.2 },
      diagnostics: {
        categories: ['localized-change'],
        boundingBox: { x: 0, y: 0, width: 1, height: 1 },
        changedAreaRatio: 0.25,
        density: 1
      }
    });
    expect(reviewResult.diagnostics?.summary).toContain('localized change');
    expect(reviewResult.diagnostics?.likelyCauses[0]).toContain('localized icon');
    expect(strictResult).toMatchObject({ status: 'fail', classification: 'visual-diff' });
  });
});

describe('evaluateVisualThreshold', () => {
  it('passes when both pixel count and ratio are within threshold', () => {
    expect(evaluateVisualThreshold({ diffPixels: 2, totalPixels: 100, threshold: { maxDiffPixels: 3, maxDiffPixelRatio: 0.03 } })).toMatchObject({
      passed: true,
      diffRatio: 0.02
    });
  });

  it('fails when either pixel count or ratio exceeds threshold', () => {
    expect(evaluateVisualThreshold({ diffPixels: 4, totalPixels: 100, threshold: { maxDiffPixels: 3, maxDiffPixelRatio: 0.1 } })).toMatchObject({
      passed: false,
      reason: 'maxDiffPixels'
    });
    expect(evaluateVisualThreshold({ diffPixels: 4, totalPixels: 100, threshold: { maxDiffPixels: 10, maxDiffPixelRatio: 0.03 } })).toMatchObject({
      passed: false,
      reason: 'maxDiffPixelRatio'
    });
  });
});
