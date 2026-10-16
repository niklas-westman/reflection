import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import type { RgbaImage } from '../../contracts/visual/image-io.js';
import type { Box, ExperimentMeasurement } from './record.js';

export interface MeasuredComparison {
  measurement: ExperimentMeasurement;
  diffPng: Buffer;
}

// Same pixelmatch settings as the native comparison, so totalDiffPixels is directly comparable with it.
// The region only splits the count by location; no pixel is excluded from the total.
export function measureDifference(expected: RgbaImage, actual: RgbaImage, cssRegion: Box, deviceScaleFactor: number): MeasuredComparison | undefined {
  if (expected.width !== actual.width || expected.height !== actual.height) {
    return undefined;
  }

  const diff = new PNG({ width: expected.width, height: expected.height });
  const totalDiffPixels = pixelmatch(expected.data, actual.data, diff.data, expected.width, expected.height, { threshold: 0.1 });
  const region = toDeviceRegion(cssRegion, deviceScaleFactor, expected.width, expected.height);

  let regionDiffPixels = 0;
  for (let y = region.y; y < region.y + region.height; y += 1) {
    for (let x = region.x; x < region.x + region.width; x += 1) {
      if (isCountedDifference(diff.data, (y * expected.width + x) * 4)) {
        regionDiffPixels += 1;
      }
    }
  }

  return {
    measurement: {
      totalDiffPixels,
      regionDiffPixels,
      outsideRegionDiffPixels: totalDiffPixels - regionDiffPixels,
      totalPixels: expected.width * expected.height,
      regionPixels: region.width * region.height,
      region,
      regionUnit: 'device-pixels'
    },
    diffPng: PNG.sync.write(diff)
  };
}

// pixelmatch paints counted differences pure red and anti-aliased pixels (not counted) yellow.
function isCountedDifference(data: Buffer, offset: number): boolean {
  return data[offset] === 255 && data[offset + 1] === 0 && data[offset + 2] === 0;
}

function toDeviceRegion(cssRegion: Box, deviceScaleFactor: number, imageWidth: number, imageHeight: number): Box {
  const left = Math.max(0, Math.floor(cssRegion.x * deviceScaleFactor));
  const top = Math.max(0, Math.floor(cssRegion.y * deviceScaleFactor));
  const right = Math.min(imageWidth, Math.ceil((cssRegion.x + cssRegion.width) * deviceScaleFactor));
  const bottom = Math.min(imageHeight, Math.ceil((cssRegion.y + cssRegion.height) * deviceScaleFactor));
  return { x: left, y: top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
}

export function padRegion(box: Box, padding: number): Box {
  return { x: box.x - padding, y: box.y - padding, width: box.width + padding * 2, height: box.height + padding * 2 };
}
