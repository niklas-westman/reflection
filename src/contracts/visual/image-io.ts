import { copyFile, readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { PNG } from 'pngjs';

export interface RgbaImage {
  width: number;
  height: number;
  data: Buffer;
}

export type BaselineImageFormat = 'png' | 'webp-lossless' | 'webp-lossy';

const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// Loaded on first WebP use so PNG-only projects never depend on sharp's native binary being present.
async function loadSharp(): Promise<typeof import('sharp')['default']> {
  const module = await import('sharp');
  return module.default;
}

export class UnsupportedImageFormatError extends Error {
  constructor(path: string) {
    super(`Unsupported baseline image format: ${path}. Reflection reads PNG and WebP.`);
    this.name = 'UnsupportedImageFormatError';
  }
}

// Detected from the file header, not the extension, so a mislabelled baseline still decodes correctly.
export function detectImageFormat(content: Buffer): BaselineImageFormat | undefined {
  if (content.length >= pngSignature.length && content.subarray(0, pngSignature.length).equals(pngSignature)) {
    return 'png';
  }

  const isWebp = content.length >= 16 && content.toString('latin1', 0, 4) === 'RIFF' && content.toString('latin1', 8, 12) === 'WEBP';
  if (!isWebp) {
    return undefined;
  }

  return detectWebpEncoding(content);
}

function detectWebpEncoding(content: Buffer): BaselineImageFormat {
  let offset = 12;
  while (offset + 8 <= content.length) {
    const fourcc = content.toString('latin1', offset, offset + 4);
    if (fourcc === 'VP8L') {
      return 'webp-lossless';
    }
    if (fourcc === 'VP8 ') {
      return 'webp-lossy';
    }
    const chunkSize = content.readUInt32LE(offset + 4);
    // RIFF chunks are padded to an even length.
    offset += 8 + chunkSize + (chunkSize % 2);
  }
  return 'webp-lossy';
}

export async function readImage(path: string): Promise<{ image: RgbaImage; format: BaselineImageFormat }> {
  return decodeImageBytes(await readFile(path), path);
}

export async function decodeImageBytes(content: Buffer, label: string): Promise<{ image: RgbaImage; format: BaselineImageFormat }> {
  const format = detectImageFormat(content);
  if (!format) {
    throw new UnsupportedImageFormatError(label);
  }

  if (format === 'png') {
    return { image: PNG.sync.read(content), format };
  }

  const sharp = await loadSharp();
  const decoded = await sharp(content).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { image: { width: decoded.info.width, height: decoded.info.height, data: decoded.data }, format };
}

// Reports always show PNG, so a WebP baseline is re-encoded losslessly for expected.png while PNG baselines keep their exact bytes.
export async function readBaselineAsPngBuffer(path: string): Promise<{ png: Buffer; format: BaselineImageFormat }> {
  const content = await readFile(path);
  const format = detectImageFormat(content);
  if (!format) {
    throw new UnsupportedImageFormatError(path);
  }

  if (format === 'png') {
    return { png: content, format };
  }

  const sharp = await loadSharp();
  return { png: await sharp(content).png().toBuffer(), format };
}

export function isWebpPath(path: string): boolean {
  return extname(path).toLowerCase() === '.webp';
}

export async function promoteBaselineImage(sourcePngPath: string, destinationPath: string): Promise<void> {
  if (!isWebpPath(destinationPath)) {
    await copyFile(sourcePngPath, destinationPath);
    return;
  }

  const sharp = await loadSharp();
  // exact keeps RGB values under transparent pixels, so the promoted baseline decodes to the same pixels as the run's actual.png.
  await sharp(sourcePngPath).webp({ lossless: true, exact: true, effort: 6 }).toFile(destinationPath);
}
