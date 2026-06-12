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

export type VisualDiffCategory =
  | 'dimension-mismatch'
  | 'broad-framing-or-layout'
  | 'localized-change'
  | 'sparse-text-or-antialiasing'
  | 'color-or-token-drift';

export type VisualDiffBoundingBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type VisualDiffDiagnostics = {
  summary: string;
  categories: VisualDiffCategory[];
  boundingBox?: VisualDiffBoundingBox;
  changedAreaRatio?: number;
  density?: number;
  colorDelta?: {
    average: number;
    max: number;
  };
  distribution?: {
    horizontal: {
      left: number;
      center: number;
      right: number;
    };
    vertical: {
      top: number;
      middle: number;
      bottom: number;
    };
  };
  likelyCauses: string[];
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
  diagnostics?: VisualDiffDiagnostics;
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
      diagnostics: createDimensionMismatchDiagnostics(expectedDimensions, actualDimensions),
      ...(input.threshold ? { threshold: input.threshold } : {})
    };
  }

  const diff = new PNG({ width: expected.width, height: expected.height });
  const diffPixels = pixelmatch(expected.data, actual.data, diff.data, expected.width, expected.height, { threshold: 0.1 });
  const diagnostics = diffPixels > 0 ? analyzeVisualDiff(expected, actual, diff, diffPixels) : undefined;
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
    ...(input.diffPath ? { diffPath: input.diffPath } : {}),
    ...(diagnostics ? { diagnostics } : {})
  };
}

export function formatVisualDiagnosticsDetails(diagnostics: VisualDiffDiagnostics | undefined): string | undefined {
  if (!diagnostics) {
    return undefined;
  }

  const lines = [`Visual diagnostics: ${diagnostics.summary}`];
  if (diagnostics.boundingBox) {
    lines.push(
      `Changed bounds: x=${diagnostics.boundingBox.x}, y=${diagnostics.boundingBox.y}, width=${diagnostics.boundingBox.width}, height=${diagnostics.boundingBox.height}.`
    );
  }
  if (diagnostics.likelyCauses.length > 0) {
    lines.push(`Likely next checks: ${diagnostics.likelyCauses.join(' ')}`);
  }
  return lines.join('\n');
}

async function readPng(path: string): Promise<PNG> {
  const content = await readFile(path);
  return PNG.sync.read(content);
}

function createDimensionMismatchDiagnostics(expected: ImageDimensions, actual: ImageDimensions): VisualDiffDiagnostics {
  return {
    summary: `Expected ${expected.width}x${expected.height}, actual ${actual.width}x${actual.height}.`,
    categories: ['dimension-mismatch'],
    likelyCauses: ['Check viewportSize, screenshot clipping, and baseline PNG dimensions before reviewing pixel content.']
  };
}

function analyzeVisualDiff(expected: PNG, actual: PNG, diff: PNG, diffPixels: number): VisualDiffDiagnostics | undefined {
  let minX = expected.width;
  let minY = expected.height;
  let maxX = -1;
  let maxY = -1;
  let changedPixels = 0;
  let totalDelta = 0;
  let maxDelta = 0;
  const horizontal = { left: 0, center: 0, right: 0 };
  const vertical = { top: 0, middle: 0, bottom: 0 };

  for (let y = 0; y < expected.height; y += 1) {
    for (let x = 0; x < expected.width; x += 1) {
      const offset = (y * expected.width + x) * 4;
      if (!isPixelmatchDiffPixel(diff.data, offset)) {
        continue;
      }

      const delta = pixelDelta(expected.data, actual.data, offset);

      changedPixels += 1;
      totalDelta += delta;
      maxDelta = Math.max(maxDelta, delta);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);

      if (x < expected.width / 3) {
        horizontal.left += 1;
      } else if (x < (expected.width / 3) * 2) {
        horizontal.center += 1;
      } else {
        horizontal.right += 1;
      }

      if (y < expected.height / 3) {
        vertical.top += 1;
      } else if (y < (expected.height / 3) * 2) {
        vertical.middle += 1;
      } else {
        vertical.bottom += 1;
      }
    }
  }

  if (changedPixels === 0) {
    return undefined;
  }

  const boundingBox = { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
  const totalPixels = expected.width * expected.height;
  const changedAreaRatio = (boundingBox.width * boundingBox.height) / totalPixels;
  const density = diffPixels / (boundingBox.width * boundingBox.height);
  const averageDelta = totalDelta / changedPixels;
  const categories = categorizeVisualDiff({
    diffRatio: diffPixels / totalPixels,
    changedAreaRatio,
    density,
    averageDelta,
    boundingBox,
    dimensions: { width: expected.width, height: expected.height }
  });

  return {
    summary: createDiagnosticsSummary(categories, changedAreaRatio, density, horizontal, vertical),
    categories,
    boundingBox,
    changedAreaRatio: roundRatio(changedAreaRatio),
    density: roundRatio(density),
    colorDelta: {
      average: roundNumber(averageDelta),
      max: roundNumber(maxDelta)
    },
    distribution: {
      horizontal: normalizeDistribution(horizontal, changedPixels),
      vertical: normalizeDistribution(vertical, changedPixels)
    },
    likelyCauses: createLikelyCauses(categories)
  };
}

function isPixelmatchDiffPixel(data: Buffer, offset: number): boolean {
  const red = data[offset] ?? 0;
  const green = data[offset + 1] ?? 0;
  const blue = data[offset + 2] ?? 0;

  return red > 200 && blue < 80 && (green < 80 || green > 180);
}

function pixelDelta(expected: Buffer, actual: Buffer, offset: number): number {
  return (
    Math.abs((expected[offset] ?? 0) - (actual[offset] ?? 0)) +
    Math.abs((expected[offset + 1] ?? 0) - (actual[offset + 1] ?? 0)) +
    Math.abs((expected[offset + 2] ?? 0) - (actual[offset + 2] ?? 0)) +
    Math.abs((expected[offset + 3] ?? 0) - (actual[offset + 3] ?? 0))
  );
}

function categorizeVisualDiff(input: {
  diffRatio: number;
  changedAreaRatio: number;
  density: number;
  averageDelta: number;
  boundingBox: VisualDiffBoundingBox;
  dimensions: ImageDimensions;
}): VisualDiffCategory[] {
  const categories = new Set<VisualDiffCategory>();
  const touchesHorizontalEdge = input.boundingBox.x <= 1 || input.boundingBox.x + input.boundingBox.width >= input.dimensions.width - 1;
  const touchesVerticalEdge = input.boundingBox.y <= 1 || input.boundingBox.y + input.boundingBox.height >= input.dimensions.height - 1;
  const changedRegionPixels = input.boundingBox.width * input.boundingBox.height;
  const hasMeaningfulRegion = changedRegionPixels > 16;
  const isSparse = input.density < 0.18 && input.changedAreaRatio > 0.03;

  if (
    hasMeaningfulRegion &&
    ((!isSparse && input.changedAreaRatio > 0.45) ||
      (input.diffRatio > 0.12 && input.changedAreaRatio > 0.2) ||
      (touchesHorizontalEdge && touchesVerticalEdge))
  ) {
    categories.add('broad-framing-or-layout');
  }

  if (isSparse) {
    categories.add('sparse-text-or-antialiasing');
  }

  if (hasMeaningfulRegion && input.averageDelta > 80 && input.density > 0.12) {
    categories.add('color-or-token-drift');
  }

  if (categories.size === 0 || input.changedAreaRatio <= 0.12 || !hasMeaningfulRegion) {
    categories.add('localized-change');
  }

  return [...categories];
}

function createDiagnosticsSummary(
  categories: VisualDiffCategory[],
  changedAreaRatio: number,
  density: number,
  horizontal: Record<'left' | 'center' | 'right', number>,
  vertical: Record<'top' | 'middle' | 'bottom', number>
): string {
  const area = formatPercent(changedAreaRatio);
  const resolvedDensity = formatPercent(density);
  const strongestHorizontal = strongestBucket(horizontal);
  const strongestVertical = strongestBucket(vertical);
  const category = categories.map(formatCategory).join(', ');
  return `${category}; diff bounding box covers ${area} of the image with ${resolvedDensity} changed-pixel density, concentrated near ${strongestVertical}/${strongestHorizontal}.`;
}

function createLikelyCauses(categories: VisualDiffCategory[]): string[] {
  const causes = new Set<string>();
  if (categories.includes('broad-framing-or-layout')) {
    causes.add('Check viewport size, root frame dimensions, centering, padding, and component layout shifts.');
  }
  if (categories.includes('sparse-text-or-antialiasing')) {
    causes.add('Check font loading, font weight, letter spacing, line height, copy, and text wrapping before changing thresholds.');
  }
  if (categories.includes('color-or-token-drift')) {
    causes.add('Check theme mode, design tokens, state variant, opacity, border color, and background color bindings.');
  }
  if (categories.includes('localized-change')) {
    causes.add('Inspect the highlighted region for a localized icon, border, radius, spacing, or state mismatch.');
  }
  return [...causes];
}

function normalizeDistribution<T extends string>(values: Record<T, number>, total: number): Record<T, number> {
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, roundRatio(Number(value) / total)])) as Record<T, number>;
}

function strongestBucket<T extends string>(values: Record<T, number>): T {
  return Object.entries(values).sort(([, a], [, b]) => Number(b) - Number(a))[0]?.[0] as T;
}

function formatCategory(category: VisualDiffCategory): string {
  return category.replaceAll('-', ' ');
}

function roundRatio(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function roundNumber(value: number): number {
  return Math.round(value * 100) / 100;
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}
