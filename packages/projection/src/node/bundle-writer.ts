import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { lstat, mkdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { BundleBuildError, buildBundleManifest, finalizeProjection, findLeaks } from '../bundle-build.js';
import { BUNDLE_MANIFEST_PATH, BUNDLE_PROJECTION_PATH, bundleManifestSchema, bundlePathSchema, type BundleFile, type BundleFileKind, type BundleManifest } from '../bundle-manifest.js';
import type { Projection } from '../projection.js';
import type { ReleaseManifest } from '../release.js';

interface BundleFileInputBase {
  // Where the file goes inside the bundle, for example "artifacts/button/primary-hover.png".
  path: string;
  kind: Exclude<BundleFileKind, 'entry'>;
}

export interface BundleFileFromMemory extends BundleFileInputBase {
  content: Uint8Array | string;
}

export interface BundleFileFromDisk extends BundleFileInputBase {
  // A regular file. Streamed, so large evidence never has to fit in memory.
  fromFile: string;
}

export type BundleFileInput = BundleFileFromMemory | BundleFileFromDisk;

export interface WriteBundleOptions {
  // Must not exist yet: a published bundle is immutable.
  directory: string;
  projection: Projection;
  release: ReleaseManifest;
  generator: BundleManifest['generator'];
  files: BundleFileInput[];
  createdAt?: string;
}

const TEXT_EXTENSIONS = /\.(json|md|txt)$/i;

/**
 * Writes an immutable evidence bundle. Everything is checked and written to a sibling temporary directory
 * first and renamed into place at the end, so a failure never leaves a half-written bundle behind.
 */
export async function writeBundle(options: WriteBundleOptions): Promise<BundleManifest> {
  const directory = resolve(options.directory);
  if (await exists(directory)) {
    throw new BundleBuildError([`${directory} already exists; a bundle is never overwritten`]);
  }
  validateInputPaths(options.files);

  const partialDirectory = `${directory}.partial-${process.pid}`;
  await rm(partialDirectory, { recursive: true, force: true });
  await mkdir(partialDirectory, { recursive: true });

  try {
    const written = await copyFiles(options.files, partialDirectory);
    const projection = finalizeProjection(options.projection, options.release, written);
    const projectionText = `${JSON.stringify(projection, null, 2)}\n`;
    assertNoLeaks([{ path: BUNDLE_PROJECTION_PATH, text: projectionText }]);
    const projectionFile = await writeText(partialDirectory, BUNDLE_PROJECTION_PATH, projectionText, 'entry');

    const manifest = await buildBundleManifest({
      project: projection.project,
      release: options.release,
      generator: options.generator,
      createdAt: options.createdAt ?? new Date().toISOString(),
      files: [...written, projectionFile]
    });
    bundleManifestSchema.parse(manifest);
    await writeFile(join(partialDirectory, BUNDLE_MANIFEST_PATH), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

    await mkdir(dirname(directory), { recursive: true });
    await rename(partialDirectory, directory);
    return manifest;
  } catch (error) {
    await rm(partialDirectory, { recursive: true, force: true });
    throw error;
  }
}

function validateInputPaths(files: BundleFileInput[]): void {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const file of files) {
    const parsed = bundlePathSchema.safeParse(file.path);
    if (!parsed.success) {
      problems.push(`${file.path}: ${parsed.error.issues.map((issue) => issue.message).join('; ')}`);
    } else if (file.path === BUNDLE_PROJECTION_PATH) {
      problems.push(`${BUNDLE_PROJECTION_PATH} is written by the writer; do not supply it`);
    }
    if (seen.has(file.path)) {
      problems.push(`${file.path} is supplied twice`);
    }
    seen.add(file.path);
  }
  if (problems.length > 0) {
    throw new BundleBuildError(problems);
  }
}

async function copyFiles(files: BundleFileInput[], destinationRoot: string): Promise<BundleFile[]> {
  const written: BundleFile[] = [];
  for (const file of files) {
    const destination = join(destinationRoot, file.path);
    await mkdir(dirname(destination), { recursive: true });
    written.push('fromFile' in file ? await copyFromDisk(file, destination) : await copyFromMemory(file, destination));
  }
  return written;
}

async function copyFromMemory(file: BundleFileFromMemory, destination: string): Promise<BundleFile> {
  const bytes = typeof file.content === 'string' ? new TextEncoder().encode(file.content) : file.content;
  if (TEXT_EXTENSIONS.test(file.path)) {
    assertNoLeaks([{ path: file.path, text: new TextDecoder().decode(bytes) }]);
  }
  await writeFile(destination, bytes);
  return { path: file.path, kind: file.kind, sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.byteLength };
}

async function copyFromDisk(file: BundleFileFromDisk, destination: string): Promise<BundleFile> {
  const source = resolve(file.fromFile);
  const stats = await lstat(source);
  if (!stats.isFile()) {
    throw new BundleBuildError([`${file.fromFile} is not a regular file (links are not followed)`]);
  }

  const hash = createHash('sha256');
  let bytes = 0;
  const chunks: Buffer[] = [];
  const collectText = TEXT_EXTENSIONS.test(file.path);
  const reader = createReadStream(source);
  reader.on('data', (chunk) => {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    hash.update(buffer);
    bytes += buffer.byteLength;
    if (collectText) {
      chunks.push(buffer);
    }
  });
  await pipeline(reader, createWriteStream(destination));

  if (collectText) {
    assertNoLeaks([{ path: file.path, text: Buffer.concat(chunks).toString('utf8') }]);
  }
  return { path: file.path, kind: file.kind, sha256: hash.digest('hex'), bytes };
}

async function writeText(root: string, path: string, text: string, kind: BundleFileKind): Promise<BundleFile> {
  const bytes = new TextEncoder().encode(text);
  await writeFile(join(root, path), bytes);
  return { path, kind, sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.byteLength };
}

function assertNoLeaks(texts: Array<{ path: string; text: string }>): void {
  const leaks = texts.flatMap(({ path, text }) => findLeaks(text, path));
  if (leaks.length > 0) {
    throw new BundleBuildError(leaks);
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}
