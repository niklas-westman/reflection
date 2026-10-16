import { createHash } from 'node:crypto';
import { lstat, readFile, realpath, stat } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { decodeImageBytes, detectImageFormat } from '../../contracts/visual/image-io.js';
import { TextSourceBundleSchema, type TextSourceBundle, type TextSourceOutline } from './bundle-schema.js';
import { inspectSvg, type SvgInspectionAccepted } from './svg-safety.js';

export interface DiagnosticReason {
  code: string;
  message: string;
  path?: string;
  // invalid (default) is unusable or unsafe input; unsupported is benign content the renderer does not model.
  kind?: InputState;
}

export type InputState = 'invalid' | 'unsupported';

export class TextDiagnosticsInputError extends Error {
  readonly state: InputState;
  readonly reasons: DiagnosticReason[];

  constructor(state: InputState, reasons: DiagnosticReason[]) {
    super(reasons.map((reason) => reason.message).join('; '));
    this.name = 'TextDiagnosticsInputError';
    this.state = state;
    this.reasons = reasons;
  }
}

export interface LoadedOutline {
  artifact: TextSourceOutline;
  bytes: Buffer;
  inspection: SvgInspectionAccepted;
}

export interface LoadedTextSource {
  bundle: TextSourceBundle;
  bundlePath: string;
  bundleSha256: string;
  directory: string;
  reference: { bytes: Buffer; format: 'png' | 'webp-lossless' | 'webp-lossy' };
  outlines: LoadedOutline[];
}

export interface TextSourceLimits {
  maxBundleBytes: number;
  maxReferenceBytes: number;
  maxSvgBytes: number;
  maxTotalSvgBytes: number;
}

export const defaultTextSourceLimits: TextSourceLimits = {
  maxBundleBytes: 1024 * 1024,
  maxReferenceBytes: 16 * 1024 * 1024,
  maxSvgBytes: 2 * 1024 * 1024,
  maxTotalSvgBytes: 8 * 1024 * 1024
};

export async function loadTextSource(bundlePath: string, limits: TextSourceLimits = defaultTextSourceLimits): Promise<LoadedTextSource> {
  const resolvedBundlePath = resolve(bundlePath);
  const bundleBytes = await readBoundedFile(resolvedBundlePath, limits.maxBundleBytes, 'bundle');
  const bundle = parseBundle(bundleBytes);
  const directory = dirname(await realpath(resolvedBundlePath));
  const reasons: DiagnosticReason[] = [];

  const referenceBytes = await readArtifactFile({
    directory,
    artifact: bundle.reference,
    maxBytes: limits.maxReferenceBytes,
    reasons,
    label: 'reference'
  });
  const referenceFormat = referenceBytes ? await verifyReference(bundle, referenceBytes, reasons) : undefined;

  const outlines: LoadedOutline[] = [];
  let totalSvgBytes = 0;
  for (const artifact of bundle.outlines) {
    const bytes = await readArtifactFile({ directory, artifact, maxBytes: limits.maxSvgBytes, reasons, label: `outline ${artifact.id}` });
    if (!bytes) {
      continue;
    }

    totalSvgBytes += bytes.length;
    if (totalSvgBytes > limits.maxTotalSvgBytes) {
      reasons.push({ code: 'svg-batch-too-large', message: `Outlined SVGs exceed ${limits.maxTotalSvgBytes} bytes in total.` });
      break;
    }

    const inspection = inspectSvg(bytes);
    if (!inspection.accepted) {
      reasons.push(...inspection.findings.map((finding) => ({ ...finding, path: `outlines.${artifact.id}`, kind: inspection.state })));
      continue;
    }

    const boundsReason = checkOutlineBounds(bundle, artifact, inspection);
    if (boundsReason) {
      reasons.push(boundsReason);
      continue;
    }

    outlines.push({ artifact, bytes, inspection });
  }

  if (reasons.length > 0 || !referenceBytes || !referenceFormat) {
    throw new TextDiagnosticsInputError(reasons.some((reason) => (reason.kind ?? 'invalid') === 'invalid') ? 'invalid' : 'unsupported', reasons);
  }

  return {
    bundle,
    bundlePath: resolvedBundlePath,
    bundleSha256: sha256(bundleBytes),
    directory,
    reference: { bytes: referenceBytes, format: referenceFormat },
    outlines
  };
}

function parseBundle(bytes: Buffer): TextSourceBundle {
  let json: unknown;
  try {
    json = JSON.parse(bytes.toString('utf8'));
  } catch (error) {
    throw new TextDiagnosticsInputError('invalid', [{ code: 'bundle-malformed', message: `Source bundle is not valid JSON: ${error instanceof Error ? error.message : String(error)}` }]);
  }

  const parsed = TextSourceBundleSchema.safeParse(json);
  if (!parsed.success) {
    throw new TextDiagnosticsInputError(
      'invalid',
      parsed.error.issues.map((issue) => ({ code: 'bundle-schema', message: `${issue.path.join('.') || 'bundle'}: ${issue.message}`, path: issue.path.join('.') }))
    );
  }

  return parsed.data;
}

async function readBoundedFile(path: string, maxBytes: number, label: string): Promise<Buffer> {
  let size: number;
  try {
    size = (await stat(path)).size;
  } catch {
    throw new TextDiagnosticsInputError('invalid', [{ code: `${label}-missing`, message: `The ${label} file does not exist: ${path}` }]);
  }

  if (size > maxBytes) {
    throw new TextDiagnosticsInputError('invalid', [{ code: `${label}-too-large`, message: `The ${label} file is ${size} bytes; the limit is ${maxBytes}.` }]);
  }

  return readFile(path);
}

async function readArtifactFile(input: {
  directory: string;
  artifact: { path: string; bytes: number; sha256: string };
  maxBytes: number;
  reasons: DiagnosticReason[];
  label: string;
}): Promise<Buffer | undefined> {
  const { artifact, reasons, label } = input;
  let realPath: string;
  try {
    realPath = await realpath(resolve(input.directory, artifact.path));
  } catch {
    reasons.push({ code: 'artifact-missing', message: `The ${label} file is missing: ${artifact.path}`, path: artifact.path });
    return undefined;
  }

  // The realpath check also catches symlinks that point outside the bundle directory.
  const relation = relative(input.directory, realPath);
  if (relation.startsWith('..') || isAbsolute(relation)) {
    reasons.push({ code: 'artifact-outside-bundle', message: `The ${label} file resolves outside the bundle directory: ${artifact.path}`, path: artifact.path });
    return undefined;
  }

  const stats = await lstat(realPath);
  if (!stats.isFile()) {
    reasons.push({ code: 'artifact-not-file', message: `The ${label} path is not a regular file: ${artifact.path}`, path: artifact.path });
    return undefined;
  }

  if (stats.size > input.maxBytes) {
    reasons.push({ code: 'artifact-too-large', message: `The ${label} file is ${stats.size} bytes; the limit is ${input.maxBytes}.`, path: artifact.path });
    return undefined;
  }

  const bytes = await readFile(realPath);
  if (bytes.length !== artifact.bytes) {
    reasons.push({ code: 'artifact-size-mismatch', message: `The ${label} file is ${bytes.length} bytes, the bundle declares ${artifact.bytes}.`, path: artifact.path });
    return undefined;
  }

  if (sha256(bytes) !== artifact.sha256) {
    reasons.push({ code: 'artifact-hash-mismatch', message: `The ${label} file does not match its declared SHA-256 (tampered or stale).`, path: artifact.path });
    return undefined;
  }

  return bytes;
}

async function verifyReference(bundle: TextSourceBundle, bytes: Buffer, reasons: DiagnosticReason[]): Promise<'png' | 'webp-lossless' | 'webp-lossy' | undefined> {
  const format = detectImageFormat(bytes);
  const expectedFamily = bundle.reference.mediaType === 'image/png' ? 'png' : 'webp';
  if (!format || !format.startsWith(expectedFamily)) {
    reasons.push({ code: 'reference-format-mismatch', message: `The reference is not a ${bundle.reference.mediaType} image.`, path: bundle.reference.path });
    return undefined;
  }

  const decoded = await decodeImageBytes(bytes, bundle.reference.path)
    .then((result) => result.image)
    .catch(() => undefined);
  if (!decoded) {
    reasons.push({ code: 'reference-undecodable', message: 'The reference image could not be decoded.', path: bundle.reference.path });
    return undefined;
  }

  const expectedWidth = Math.round(bundle.viewport.width * bundle.viewport.deviceScaleFactor);
  const expectedHeight = Math.round(bundle.viewport.height * bundle.viewport.deviceScaleFactor);
  if (decoded.width !== expectedWidth || decoded.height !== expectedHeight) {
    reasons.push({
      code: 'reference-dimension-mismatch',
      message: `The reference is ${decoded.width}x${decoded.height} but the viewport and device scale imply ${expectedWidth}x${expectedHeight}.`,
      path: bundle.reference.path
    });
    return undefined;
  }

  return format;
}

function checkOutlineBounds(bundle: TextSourceBundle, outline: TextSourceOutline, inspection: SvgInspectionAccepted): DiagnosticReason | undefined {
  const tolerance = 0.5;
  if (Math.abs(inspection.width - outline.bounds.width) > tolerance || Math.abs(inspection.height - outline.bounds.height) > tolerance) {
    return {
      code: 'outline-bounds-mismatch',
      message: `Outline ${outline.id} is ${inspection.width}x${inspection.height} but its declared bounds are ${outline.bounds.width}x${outline.bounds.height}.`,
      path: outline.path
    };
  }

  if (outline.kind === 'frame') {
    const { width, height } = bundle.viewport;
    if (outline.bounds.x !== 0 || outline.bounds.y !== 0 || Math.abs(outline.bounds.width - width) > tolerance || Math.abs(outline.bounds.height - height) > tolerance) {
      return { code: 'frame-bounds-mismatch', message: `Frame outline ${outline.id} must cover the ${width}x${height} viewport from the origin.`, path: outline.path };
    }
  }

  return undefined;
}

export function sha256(bytes: Buffer | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}
