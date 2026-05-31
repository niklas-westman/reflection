import { readFile, writeFile } from 'node:fs/promises';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import { evaluateVisualThreshold, type VisualThreshold } from './thresholds.js';

export type ComparePngImagesInput = {
  expectedPath: string;
  actualPath: string;
  diffPath?: string;
  threshold?: VisualThreshold;
  strict?: boolean;
};

export type ImageDimensions = {
  width: number;
  height: number;
};

export type ImageDiffResult = {
  status: 'pass' | 'warn' | 'fail';
  classification: 'visual-match' | 'visual-diff' | 'visual-dimension-mismatch';
  width?: number;
  height?: number;
  expected: ImageDimensions;
  actual: ImageDimensions;
  diffPixels: number;
  diffRatio: number;
  dimensionMismatch: boolean;
  threshold?: VisualThreshold;
  thresholdReason?: 'maxDiffPixels' | 'maxDiffPixelRatio';
  diffPath?: string;
};

export async function comparePngImages(input: ComparePngImagesInput): Promise<ImageDiffResult> {
  const [expected, actual] = await Promise.all([readPng(input.expectedPath), readPng(input.actualPath)]);
  const expectedDimensions = { width: expected.width, height: expected.height };
  const actualDimensions = { width: actual.width, height: actual.height };

  if (expected.width !== actual.width || expected.height !== actual.height) {
    return {
      status: 'fail',
      classification: 'visual-dimension-mismatch',
      expected: expectedDimensions,
      actual: actualDimensions,
      diffPixels: 0,
      diffRatio: 1,
      dimensionMismatch: true,
      ...(input.threshold ? { threshold: input.threshold } : {})
    };
  }

  const diff = new PNG({ width: expected.width, height: expected.height });
  const diffPixels = pixelmatch(expected.data, actual.data, diff.data, expected.width, expected.height, { threshold: 0.1 });
  const thresholdInput = input.threshold
    ? {
        diffPixels,
        totalPixels: expected.width * expected.height,
        threshold: input.threshold
      }
    : {
        diffPixels,
        totalPixels: expected.width * expected.height
      };
  const evaluation = evaluateVisualThreshold(thresholdInput);

  if (input.diffPath) {
    await writeFile(input.diffPath, PNG.sync.write(diff));
  }

  const classification = diffPixels === 0 ? 'visual-match' : 'visual-diff';
  const status = evaluation.passed ? 'pass' : input.strict === true ? 'fail' : 'warn';

  return {
    status,
    classification,
    width: expected.width,
    height: expected.height,
    expected: expectedDimensions,
    actual: actualDimensions,
    diffPixels,
    diffRatio: evaluation.diffRatio,
    dimensionMismatch: false,
    ...(input.threshold ? { threshold: input.threshold } : {}),
    ...(evaluation.reason ? { thresholdReason: evaluation.reason } : {}),
    ...(input.diffPath ? { diffPath: input.diffPath } : {})
  };
}

async function readPng(path: string): Promise<PNG> {
  const content = await readFile(path);
  return PNG.sync.read(content);
}
