import { z } from 'zod';
import { sha256Hex } from './hashing.js';
import { idSchema, relativePathSchema, sha256Schema, timestampSchema } from './primitives.js';
import { releaseManifestSchema } from './release.js';

export const BUNDLE_MANIFEST_PATH = 'manifest.json';
export const BUNDLE_PROJECTION_PATH = 'projection.json';

// Images and text only. SVG and HTML can carry script, so a bundle can never hold executable content.
const ALLOWED_EXTENSIONS = new Set(['json', 'md', 'txt', 'png', 'webp', 'jpg', 'jpeg', 'gif']);

// A key inside a bundle. Stricter than a relative path: portable separators only, no empty or "." segments,
// no raw design dumps, and only the allowed file types.
export const bundlePathSchema = relativePathSchema
  .refine((value) => !value.includes('\\'), { message: 'path must use "/" separators' })
  .refine((value) => value.split('/').every((segment) => segment !== '' && segment !== '.'), { message: 'path must not contain empty or "." segments' })
  .refine((value) => !value.split('/').includes('_raw'), { message: 'raw design dumps ("_raw") must not be published' })
  .refine((value) => value !== BUNDLE_MANIFEST_PATH, { message: 'manifest.json is not a bundle file; it describes them' })
  .refine((value) => ALLOWED_EXTENSIONS.has(extensionOf(value)), { message: `file type must be one of: ${[...ALLOWED_EXTENSIONS].join(', ')}` });

function extensionOf(path: string): string {
  const name = path.slice(path.lastIndexOf('/') + 1);
  const dot = name.lastIndexOf('.');
  return dot === -1 ? '' : name.slice(dot + 1).toLowerCase();
}

// entry: the projection. artifact: an image a comparison points at. source: archived design inventory.
// analysis: optional machine or human commentary, bound to this bundle hash.
export const bundleFileKindSchema = z.enum(['entry', 'artifact', 'source', 'analysis']);
export type BundleFileKind = z.output<typeof bundleFileKindSchema>;

export const bundleFileSchema = z.object({
  path: bundlePathSchema,
  kind: bundleFileKindSchema,
  sha256: sha256Schema,
  bytes: z.number().int().nonnegative()
});
export type BundleFile = z.output<typeof bundleFileSchema>;

export const bundleManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    kind: z.literal('reflection-bundle'),
    project: z.object({ id: idSchema, name: z.string().min(1) }),
    release: releaseManifestSchema,
    createdAt: timestampSchema,
    generator: z.object({ name: z.string().min(1), version: z.string().min(1).optional() }),
    // Covers every file's path and hash, including the projection, so it changes whenever any content does.
    bundleHash: sha256Schema,
    files: z.array(bundleFileSchema)
  })
  .superRefine((manifest, context) => {
    const seen = new Set<string>();
    manifest.files.forEach((file, index) => {
      if (seen.has(file.path)) {
        context.addIssue({ code: 'custom', path: ['files', index, 'path'], message: `duplicate file "${file.path}"` });
      }
      seen.add(file.path);
    });

    const entries = manifest.files.filter((file) => file.kind === 'entry');
    if (entries.length !== 1 || entries[0]?.path !== BUNDLE_PROJECTION_PATH) {
      context.addIssue({ code: 'custom', path: ['files'], message: `exactly one entry file is required, and it must be ${BUNDLE_PROJECTION_PATH}` });
    }
  });
export type BundleManifest = z.output<typeof bundleManifestSchema>;

/** Identity of a bundle's content: sha256 over the sorted "path, hash" lines of every file. */
export async function computeBundleHash(files: Array<Pick<BundleFile, 'path' | 'sha256'>>): Promise<string> {
  const lines = files
    .map((file) => `${file.path}\u0000${file.sha256}\n`)
    .sort()
    .join('');
  return sha256Hex(new TextEncoder().encode(lines));
}
