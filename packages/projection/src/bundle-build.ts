import { collectArtifactRefs } from './bundle-artifacts.js';
import { BUNDLE_PROJECTION_PATH, computeBundleHash, type BundleFile, type BundleManifest } from './bundle-manifest.js';
import { projectionSchema, type Projection } from './projection.js';
import type { ReleaseManifest } from './release.js';

export class BundleBuildError extends Error {
  constructor(public readonly problems: string[]) {
    super(`the bundle cannot be built:\n- ${problems.join('\n- ')}`);
    this.name = 'BundleBuildError';
  }
}

// The obvious ways a local path or a credential ends up in published evidence. A safety net, not a guarantee:
// providers must still keep such values out of what they emit.
const LEAK_PATTERNS: ReadonlyArray<{ name: string; pattern: RegExp }> = [
  { name: 'an absolute local path', pattern: /(?:\/Users\/|\/home\/|\/private\/var\/|\/var\/folders\/|[A-Za-z]:\\\\?Users\\)/ },
  { name: 'a file:// URL', pattern: /file:\/\//i },
  { name: 'a JSON web token', pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+/ },
  { name: 'a Figma access token', pattern: /\bfig[dhopu]_[A-Za-z0-9_-]{20,}/ },
  { name: 'an AWS access key id', pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'a bearer token', pattern: /\bBearer\s+[A-Za-z0-9._~+/-]{20,}/ }
];

/** What a text file in a bundle must not contain. Returns one sentence per kind of leak found. */
export function findLeaks(text: string, path: string): string[] {
  return LEAK_PATTERNS.filter(({ pattern }) => pattern.test(text)).map(({ name }) => `${path} contains ${name}`);
}

/**
 * Binds a projection to the files that will ship with it: every artifact must be among them, and a hash the
 * provider left out is filled in from the file. A hash the provider did record must match.
 */
export function finalizeProjection(projection: Projection, release: ReleaseManifest, files: BundleFile[]): Projection {
  const finalized = projectionSchema.parse({ ...projection, release });
  const byPath = new Map(files.map((file) => [file.path, file]));
  const problems: string[] = [];

  for (const artifact of collectArtifactRefs(finalized)) {
    const file = byPath.get(artifact.path);
    if (!file) {
      problems.push(`${artifact.path} is referenced by a comparison but was not supplied`);
    } else if (artifact.sha256 !== undefined && artifact.sha256 !== file.sha256) {
      problems.push(`${artifact.path} has a recorded hash that differs from the supplied file`);
    } else {
      artifact.sha256 = file.sha256;
      artifact.bytes = file.bytes;
    }
  }

  if (problems.length > 0) {
    throw new BundleBuildError([...new Set(problems)]);
  }
  return finalized;
}

export interface BuildManifestOptions {
  project: Projection['project'];
  release: ReleaseManifest;
  generator: BundleManifest['generator'];
  createdAt: string;
  // Every file in the bundle, the projection included.
  files: BundleFile[];
}

export async function buildBundleManifest(options: BuildManifestOptions): Promise<BundleManifest> {
  const files = [...options.files].sort((a, b) => a.path.localeCompare(b.path));
  if (!files.some((file) => file.path === BUNDLE_PROJECTION_PATH)) {
    throw new BundleBuildError([`${BUNDLE_PROJECTION_PATH} is missing from the file list`]);
  }

  return {
    schemaVersion: 1,
    kind: 'reflection-bundle',
    project: options.project,
    release: options.release,
    createdAt: options.createdAt,
    generator: options.generator,
    bundleHash: await computeBundleHash(files),
    files
  };
}
