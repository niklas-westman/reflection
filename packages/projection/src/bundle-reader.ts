import { collectArtifactRefs } from './bundle-artifacts.js';
import { BUNDLE_MANIFEST_PATH, BUNDLE_PROJECTION_PATH, bundleManifestSchema, computeBundleHash, type BundleFile, type BundleManifest } from './bundle-manifest.js';
import { sha256Hex } from './hashing.js';
import { projectionSchema, type Projection } from './projection.js';

/** Where a bundle's files come from: a directory, an HTTP origin, an in-memory map. Paths are bundle keys. */
export interface BundleSource {
  read(path: string): Promise<Uint8Array>;
}

/** A source throws this when the file is not there, so a missing file is told apart from an unreadable one. */
export class BundleFileMissingError extends Error {
  constructor(public readonly path: string) {
    super(`bundle file not found: ${path}`);
    this.name = 'BundleFileMissingError';
  }
}

export type BundleProblemCode =
  | 'manifest-missing'
  | 'manifest-invalid'
  | 'unsupported-schema-version'
  | 'bundle-hash-mismatch'
  | 'entry-missing'
  | 'entry-hash-mismatch'
  | 'projection-invalid'
  | 'identity-mismatch'
  | 'file-missing'
  | 'file-unreadable'
  | 'file-hash-mismatch'
  | 'artifact-undeclared'
  | 'artifact-hash-disagrees';

export interface BundleProblem {
  code: BundleProblemCode;
  message: string;
  // The bundle file the problem is about, when there is one. Such a file must not be shown as evidence.
  path?: string;
}

// A fatal problem means the bundle cannot be trusted as a whole. Anything else only makes one file unusable.
const FATAL_CODES: ReadonlySet<BundleProblemCode> = new Set([
  'manifest-missing',
  'manifest-invalid',
  'unsupported-schema-version',
  'bundle-hash-mismatch',
  'entry-missing',
  'entry-hash-mismatch',
  'projection-invalid',
  'identity-mismatch'
]);

export function isFatalProblem(problem: BundleProblem): boolean {
  return FATAL_CODES.has(problem.code);
}

export interface OpenedBundle {
  manifest: BundleManifest;
  // The projection with `release` filled from the manifest, so there is one place to read release identity.
  projection: Projection;
  // Bundle files that are missing, unreadable, tampered with or undeclared. Never render these.
  unusablePaths: ReadonlySet<string>;
}

export type OpenBundleResult =
  | { status: 'opened'; bundle: OpenedBundle; problems: BundleProblem[] }
  | { status: 'rejected'; problems: BundleProblem[] };

export interface OpenBundleOptions {
  // entry-only: check the manifest, the bundle hash and the projection. all: also read and hash every file.
  verifyFiles?: 'entry-only' | 'all';
}

/** The problems as plain sentences, in the shape `computeValidity` takes as integrity failures. */
export function toIntegrityFailures(problems: BundleProblem[]): string[] {
  return problems.map((problem) => (problem.path ? `${problem.path}: ${problem.message}` : problem.message));
}

/**
 * Opens a bundle without throwing for bad content. A bundle that cannot be trusted as a whole is `rejected`
 * and the caller shows it as invalid, never falling back to another release. A bundle with unusable files is
 * `opened` with `problems`, so the inventory stays visible and only the affected evidence is withheld.
 */
export async function openBundle(source: BundleSource, options: OpenBundleOptions = {}): Promise<OpenBundleResult> {
  const manifestResult = await readManifest(source);
  if ('problems' in manifestResult) {
    return { status: 'rejected', problems: manifestResult.problems };
  }
  const { manifest } = manifestResult;

  const hashProblems = await checkBundleHash(manifest);
  if (hashProblems.length > 0) {
    return { status: 'rejected', problems: hashProblems };
  }

  const projectionResult = await readProjection(source, manifest);
  if ('problems' in projectionResult) {
    return { status: 'rejected', problems: projectionResult.problems };
  }
  const { projection } = projectionResult;

  const problems = [...checkArtifactsAreDeclared(projection, manifest)];
  if (options.verifyFiles === 'all') {
    problems.push(...(await verifyAllFiles(source, manifest)));
  }

  const unusablePaths = new Set(problems.flatMap((problem) => (problem.path ? [problem.path] : [])));
  return { status: 'opened', bundle: { manifest, projection, unusablePaths }, problems };
}

export type VerifiedFile = { ok: true; bytes: Uint8Array } | { ok: false; problem: BundleProblem };

/** Reads one declared file and checks its hash. A viewer calls this when it loads an image. */
export async function verifyBundleFile(source: BundleSource, manifest: BundleManifest, path: string): Promise<VerifiedFile> {
  const declared = manifest.files.find((file) => file.path === path);
  if (!declared) {
    return { ok: false, problem: { code: 'artifact-undeclared', path, message: 'the file is not declared in the manifest' } };
  }
  return readAndVerify(source, declared);
}

async function readManifest(source: BundleSource): Promise<{ manifest: BundleManifest } | { problems: BundleProblem[] }> {
  let bytes: Uint8Array;
  try {
    bytes = await source.read(BUNDLE_MANIFEST_PATH);
  } catch (error) {
    const code = error instanceof BundleFileMissingError ? 'manifest-missing' : 'manifest-invalid';
    return { problems: [{ code, message: error instanceof BundleFileMissingError ? 'the bundle has no manifest.json' : `manifest.json could not be read: ${describe(error)}` }] };
  }

  const parsed = parseJson(bytes);
  if (!parsed.ok) {
    return { problems: [{ code: 'manifest-invalid', message: `manifest.json is not valid JSON: ${parsed.message}` }] };
  }

  const version = readSchemaVersion(parsed.value);
  if (version !== 1) {
    return { problems: [{ code: 'unsupported-schema-version', message: `bundle schema version ${String(version)} is not supported; this reader supports 1` }] };
  }

  const manifest = bundleManifestSchema.safeParse(parsed.value);
  if (!manifest.success) {
    return { problems: [{ code: 'manifest-invalid', message: `manifest.json is invalid: ${summarizeIssues(manifest.error.issues)}` }] };
  }
  return { manifest: manifest.data };
}

async function checkBundleHash(manifest: BundleManifest): Promise<BundleProblem[]> {
  const actual = await computeBundleHash(manifest.files);
  return actual === manifest.bundleHash ? [] : [{ code: 'bundle-hash-mismatch', message: 'the bundle hash does not match the file list; the manifest was changed' }];
}

async function readProjection(source: BundleSource, manifest: BundleManifest): Promise<{ projection: Projection } | { problems: BundleProblem[] }> {
  const entry = manifest.files.find((file) => file.path === BUNDLE_PROJECTION_PATH);
  if (!entry) {
    return { problems: [{ code: 'entry-missing', path: BUNDLE_PROJECTION_PATH, message: 'the manifest does not list the projection' }] };
  }

  const verified = await readAndVerify(source, entry);
  if (!verified.ok) {
    const code = verified.problem.code === 'file-hash-mismatch' ? 'entry-hash-mismatch' : verified.problem.code === 'file-missing' ? 'entry-missing' : 'projection-invalid';
    return { problems: [{ ...verified.problem, code }] };
  }

  const parsed = parseJson(verified.bytes);
  if (!parsed.ok) {
    return { problems: [{ code: 'projection-invalid', path: BUNDLE_PROJECTION_PATH, message: `not valid JSON: ${parsed.message}` }] };
  }
  const projection = projectionSchema.safeParse(parsed.value);
  if (!projection.success) {
    return { problems: [{ code: 'projection-invalid', path: BUNDLE_PROJECTION_PATH, message: summarizeIssues(projection.error.issues) }] };
  }

  const mismatch = findIdentityMismatch(projection.data, manifest);
  if (mismatch) {
    return { problems: [{ code: 'identity-mismatch', path: BUNDLE_PROJECTION_PATH, message: mismatch }] };
  }
  return { projection: { ...projection.data, release: manifest.release } };
}

function findIdentityMismatch(projection: Projection, manifest: BundleManifest): string | undefined {
  if (projection.project.id !== manifest.project.id) {
    return `the projection is for project "${projection.project.id}" but the manifest says "${manifest.project.id}"`;
  }
  const { release } = projection;
  if (release && (release.bundleId !== manifest.release.bundleId || release.release !== manifest.release.release || release.build !== manifest.release.build)) {
    return 'the release recorded in the projection differs from the manifest';
  }
  return undefined;
}

function checkArtifactsAreDeclared(projection: Projection, manifest: BundleManifest): BundleProblem[] {
  const declared = new Map(manifest.files.map((file) => [file.path, file]));
  const problems: BundleProblem[] = [];
  const reported = new Set<string>();

  for (const artifact of collectArtifactRefs(projection)) {
    const file = declared.get(artifact.path);
    if (!file) {
      if (!reported.has(artifact.path)) {
        problems.push({ code: 'artifact-undeclared', path: artifact.path, message: 'a comparison points at a file the manifest does not declare' });
      }
      reported.add(artifact.path);
    } else if (artifact.sha256 !== undefined && artifact.sha256 !== file.sha256 && !reported.has(artifact.path)) {
      problems.push({ code: 'artifact-hash-disagrees', path: artifact.path, message: 'the hash recorded by the comparison differs from the manifest' });
      reported.add(artifact.path);
    }
  }
  return problems;
}

// Files are checked a few at a time: a bundle can hold thousands of images, and one at a time is needlessly slow.
const VERIFY_CONCURRENCY = 8;

async function verifyAllFiles(source: BundleSource, manifest: BundleManifest): Promise<BundleProblem[]> {
  const files = manifest.files.filter((file) => file.path !== BUNDLE_PROJECTION_PATH);
  const problems: BundleProblem[] = [];
  for (let start = 0; start < files.length; start += VERIFY_CONCURRENCY) {
    const batch = await Promise.all(files.slice(start, start + VERIFY_CONCURRENCY).map((file) => readAndVerify(source, file)));
    for (const verified of batch) {
      if (!verified.ok) {
        problems.push(verified.problem);
      }
    }
  }
  return problems;
}

async function readAndVerify(source: BundleSource, file: BundleFile): Promise<VerifiedFile> {
  let bytes: Uint8Array;
  try {
    bytes = await source.read(file.path);
  } catch (error) {
    if (error instanceof BundleFileMissingError) {
      return { ok: false, problem: { code: 'file-missing', path: file.path, message: 'the file is declared but missing' } };
    }
    return { ok: false, problem: { code: 'file-unreadable', path: file.path, message: `the file could not be read: ${describe(error)}` } };
  }

  if (bytes.byteLength !== file.bytes || (await sha256Hex(bytes)) !== file.sha256) {
    return { ok: false, problem: { code: 'file-hash-mismatch', path: file.path, message: 'the file does not match the hash in the manifest' } };
  }
  return { ok: true, bytes };
}

function parseJson(bytes: Uint8Array): { ok: true; value: unknown } | { ok: false; message: string } {
  try {
    return { ok: true, value: JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) };
  } catch (error) {
    return { ok: false, message: describe(error) };
  }
}

function readSchemaVersion(value: unknown): unknown {
  return value !== null && typeof value === 'object' ? (value as { schemaVersion?: unknown }).schemaVersion : undefined;
}

function summarizeIssues(issues: Array<{ path: PropertyKey[]; message: string }>): string {
  const shown = issues.slice(0, 3).map((issue) => `${issue.path.map(String).join('.') || '(root)'}: ${issue.message}`);
  const hidden = issues.length - shown.length;
  return hidden > 0 ? `${shown.join('; ')}; and ${hidden} more` : shown.join('; ');
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
