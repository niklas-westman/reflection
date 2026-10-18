import { lstat, readFile, realpath } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { BundleFileMissingError, type BundleSource } from '../bundle-reader.js';
import { bundlePathSchema, BUNDLE_MANIFEST_PATH } from '../bundle-manifest.js';

/**
 * Reads a bundle from a local directory. A path that would leave the directory, and any symbolic link, is
 * refused: a bundle is data, so nothing it names may point somewhere else on the machine.
 */
export function createDirectorySource(directory: string): BundleSource {
  const root = resolve(directory);

  return {
    async read(path: string): Promise<Uint8Array> {
      if (path !== BUNDLE_MANIFEST_PATH && !bundlePathSchema.safeParse(path).success) {
        throw new Error(`refusing to read "${path}": not a valid bundle path`);
      }

      const target = resolve(root, path);
      if (!target.startsWith(root + sep)) {
        throw new Error(`refusing to read "${path}": it resolves outside the bundle`);
      }

      const stats = await lstat(target).catch((error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT' || error.code === 'ENOTDIR') {
          throw new BundleFileMissingError(path);
        }
        throw error;
      });
      if (stats.isSymbolicLink() || !stats.isFile()) {
        throw new Error(`refusing to read "${path}": it is not a regular file`);
      }

      const real = await realpath(target);
      if (!real.startsWith((await realpath(root)) + sep)) {
        throw new Error(`refusing to read "${path}": it resolves outside the bundle`);
      }
      return new Uint8Array(await readFile(real));
    }
  };
}
