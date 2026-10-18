import { readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BundleBuildError,
  BundleFileMissingError,
  computeBundleHash,
  openBundle,
  toIntegrityFailures,
  verifyBundleFile,
  type BundleManifest,
  type BundleSource
} from '../src/index.js';
import { createDirectorySource, writeBundle } from '../src/node/index.js';
import { cleanUpTempDirectories, generator, makeFiles, makeProjection, makeTempDirectory, release } from './helpers/bundle-builders.js';

cleanUpTempDirectories();

async function writeTestBundle(): Promise<string> {
  const directory = join(await makeTempDirectory(), 'bundle');
  await writeBundle({ directory, projection: makeProjection(), release, generator, files: makeFiles() });
  return directory;
}

async function readManifestFile(directory: string): Promise<BundleManifest> {
  return JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8')) as BundleManifest;
}

describe('writing and opening a bundle', () => {
  it('round-trips with every file verified', async () => {
    const directory = await writeTestBundle();

    const result = await openBundle(createDirectorySource(directory), { verifyFiles: 'all' });

    expect(result.status).toBe('opened');
    if (result.status !== 'opened') return;
    expect(result.problems).toEqual([]);
    expect(result.bundle.projection.release).toEqual(release);
    expect(result.bundle.manifest.files.map((file) => file.path)).toEqual([
      'artifacts/actual.png',
      'artifacts/diff.png',
      'artifacts/reference.png',
      'projection.json',
      'source/snapshot.json'
    ]);
  });

  it('fills in artifact hashes the provider left out', async () => {
    const directory = await writeTestBundle();

    const result = await openBundle(createDirectorySource(directory));

    if (result.status !== 'opened') throw new Error('expected the bundle to open');
    const actual = result.bundle.projection.comparisons[0]?.actual;
    const declared = result.bundle.manifest.files.find((file) => file.path === 'artifacts/actual.png');
    expect(actual?.sha256).toBe(declared?.sha256);
    expect(actual?.bytes).toBe(3);
  });

  it('refuses to overwrite an existing bundle', async () => {
    const directory = await writeTestBundle();

    await expect(writeBundle({ directory, projection: makeProjection(), release, generator, files: makeFiles() })).rejects.toThrow(/never overwritten/);
  });

  it('can stream a file from disk', async () => {
    const root = await makeTempDirectory();
    await writeFile(join(root, 'actual.png'), new Uint8Array([4, 5, 6]));
    const files = makeFiles().map((file) => (file.path === 'artifacts/actual.png' ? { path: file.path, kind: file.kind, fromFile: join(root, 'actual.png') } : file));
    const directory = join(root, 'bundle');

    await writeBundle({ directory, projection: makeProjection(), release, generator, files });

    const result = await openBundle(createDirectorySource(directory), { verifyFiles: 'all' });
    expect(result.status === 'opened' && result.problems).toEqual([]);
  });
});

describe('what the writer refuses', () => {
  const attempt = async (files: ReturnType<typeof makeFiles>): Promise<unknown> => {
    const directory = join(await makeTempDirectory(), 'bundle');
    return writeBundle({ directory, projection: makeProjection(), release, generator, files }).then(
      () => 'written',
      (error: unknown) => error
    );
  };

  it('an artifact the projection points at but nobody supplied', async () => {
    const error = await attempt(makeFiles().filter((file) => file.path !== 'artifacts/diff.png'));

    expect(error).toBeInstanceOf(BundleBuildError);
    expect((error as Error).message).toContain('artifacts/diff.png is referenced by a comparison but was not supplied');
  });

  it.each([
    ['a path that climbs out', '../escape.png'],
    ['an absolute path', '/etc/passwd.png'],
    ['a raw design dump', '_raw/figma.json'],
    ['an SVG, which can carry script', 'artifacts/icon.svg'],
    ['an HTML file', 'artifacts/page.html'],
    ['a backslash path', 'artifacts\\a.png']
  ])('%s', async (_name, path) => {
    const error = await attempt([...makeFiles(), { path, kind: 'artifact', content: 'x' }]);

    expect(error).toBeInstanceOf(BundleBuildError);
  });

  it('a supplied projection.json, which the writer owns', async () => {
    const error = await attempt([...makeFiles(), { path: 'projection.json', kind: 'source', content: '{}' }]);

    expect((error as Error).message).toContain('written by the writer');
  });

  it('the same path twice', async () => {
    const error = await attempt([...makeFiles(), makeFiles()[0]!]);

    expect((error as Error).message).toContain('supplied twice');
  });

  it('a recorded hash that disagrees with the file', async () => {
    const projection = makeProjection();
    projection.comparisons[0]!.actual!.sha256 = 'a'.repeat(64);
    const directory = join(await makeTempDirectory(), 'bundle');

    await expect(writeBundle({ directory, projection, release, generator, files: makeFiles() })).rejects.toThrow(/recorded hash that differs/);
  });

  it.each([
    ['an absolute local path', '{"note":"/Users/someone/work/file.png"}'],
    ['a file URL', '{"note":"file:///tmp/x.png"}'],
    ['a Figma token', '{"token":"figd_abcdefghijklmnopqrstuvwxyz0123"}'],
    ['a JSON web token', '{"t":"eyJhbGciOiJIUzI1NiJ9.eyJlbWFpbCI6InhAeC5jb20ifQ.abcdefghijklmnop"}']
  ])('a source file containing %s', async (_name, content) => {
    const error = await attempt([...makeFiles(), { path: 'source/extra.json', kind: 'source', content }]);

    expect(error).toBeInstanceOf(BundleBuildError);
  });

  it('a local path inside the projection', async () => {
    const projection = makeProjection();
    projection.runs[0]!.runner = { cwd: '/Users/someone/project' };
    const directory = join(await makeTempDirectory(), 'bundle');

    await expect(writeBundle({ directory, projection, release, generator, files: makeFiles() })).rejects.toThrow(/absolute local path/);
  });

  it('leaves nothing behind when it fails', async () => {
    const root = await makeTempDirectory();
    const directory = join(root, 'bundle');

    await expect(writeBundle({ directory, projection: makeProjection(), release, generator, files: [] })).rejects.toThrow();

    await expect(readFile(join(root, `bundle.partial-${process.pid}`))).rejects.toThrow();
    await expect(readFile(join(directory, 'manifest.json'))).rejects.toThrow();
  });
});

describe('what the reader rejects', () => {
  it('a bundle with no manifest', async () => {
    const directory = await writeTestBundle();
    await rm(join(directory, 'manifest.json'));

    const result = await openBundle(createDirectorySource(directory));

    expect(result).toMatchObject({ status: 'rejected', problems: [{ code: 'manifest-missing' }] });
  });

  it('an unsupported schema version, named as such', async () => {
    const directory = await writeTestBundle();
    const manifest = await readManifestFile(directory);
    await writeFile(join(directory, 'manifest.json'), JSON.stringify({ ...manifest, schemaVersion: 2 }));

    const result = await openBundle(createDirectorySource(directory));

    expect(result).toMatchObject({ status: 'rejected', problems: [{ code: 'unsupported-schema-version' }] });
  });

  it('a manifest that lists a path outside the bundle', async () => {
    const directory = await writeTestBundle();
    const manifest = await readManifestFile(directory);
    const files = [...manifest.files, { path: '../outside.png', kind: 'artifact', sha256: 'b'.repeat(64), bytes: 1 }];
    await writeFile(join(directory, 'manifest.json'), JSON.stringify({ ...manifest, files, bundleHash: await computeBundleHash(files as BundleManifest['files']) }));

    const result = await openBundle(createDirectorySource(directory));

    expect(result).toMatchObject({ status: 'rejected', problems: [{ code: 'manifest-invalid' }] });
  });

  it('a manifest edited after it was written', async () => {
    const directory = await writeTestBundle();
    const manifest = await readManifestFile(directory);
    const files = manifest.files.map((file) => (file.path === 'artifacts/actual.png' ? { ...file, sha256: 'c'.repeat(64) } : file));
    await writeFile(join(directory, 'manifest.json'), JSON.stringify({ ...manifest, files }));

    const result = await openBundle(createDirectorySource(directory));

    expect(result).toMatchObject({ status: 'rejected', problems: [{ code: 'bundle-hash-mismatch' }] });
  });

  it('a projection changed after publishing', async () => {
    const directory = await writeTestBundle();
    const text = await readFile(join(directory, 'projection.json'), 'utf8');
    await writeFile(join(directory, 'projection.json'), text.replace('"status": "fail"', '"status": "pass"'));

    const result = await openBundle(createDirectorySource(directory));

    expect(result).toMatchObject({ status: 'rejected', problems: [{ code: 'entry-hash-mismatch' }] });
  });

  it('a projection for another project', async () => {
    const directory = await writeTestBundle();
    const manifest = await readManifestFile(directory);
    await writeFile(join(directory, 'manifest.json'), JSON.stringify({ ...manifest, project: { id: 'sourcer', name: 'Sourcer' } }));

    const result = await openBundle(createDirectorySource(directory));

    expect(result).toMatchObject({ status: 'rejected', problems: [{ code: 'identity-mismatch' }] });
  });
});

describe('a bundle with unusable files', () => {
  it('opens with the missing artifact marked unusable', async () => {
    const directory = await writeTestBundle();
    await rm(join(directory, 'artifacts/diff.png'));

    const result = await openBundle(createDirectorySource(directory), { verifyFiles: 'all' });

    if (result.status !== 'opened') throw new Error('expected the bundle to open');
    expect(result.problems).toEqual([expect.objectContaining({ code: 'file-missing', path: 'artifacts/diff.png' })]);
    expect([...result.bundle.unusablePaths]).toEqual(['artifacts/diff.png']);
    expect(result.bundle.projection.requirements).toHaveLength(1);
  });

  it('marks a tampered artifact unusable and never returns its bytes', async () => {
    const directory = await writeTestBundle();
    await writeFile(join(directory, 'artifacts/actual.png'), new Uint8Array([9, 9, 9]));
    const source = createDirectorySource(directory);

    const opened = await openBundle(source, { verifyFiles: 'all' });
    if (opened.status !== 'opened') throw new Error('expected the bundle to open');
    const verified = await verifyBundleFile(source, opened.bundle.manifest, 'artifacts/actual.png');

    expect(opened.problems).toEqual([expect.objectContaining({ code: 'file-hash-mismatch', path: 'artifacts/actual.png' })]);
    expect(verified.ok).toBe(false);
  });

  it('does not notice a missing file without full verification, but a single read does', async () => {
    const directory = await writeTestBundle();
    await rm(join(directory, 'artifacts/diff.png'));
    const source = createDirectorySource(directory);

    const opened = await openBundle(source);
    if (opened.status !== 'opened') throw new Error('expected the bundle to open');
    const verified = await verifyBundleFile(source, opened.bundle.manifest, 'artifacts/diff.png');

    expect(opened.problems).toEqual([]);
    expect(verified).toMatchObject({ ok: false, problem: { code: 'file-missing' } });
  });

  it('refuses to read a file the manifest does not declare', async () => {
    const directory = await writeTestBundle();
    const source = createDirectorySource(directory);
    const opened = await openBundle(source);
    if (opened.status !== 'opened') throw new Error('expected the bundle to open');

    const verified = await verifyBundleFile(source, opened.bundle.manifest, 'artifacts/other.png');

    expect(verified).toMatchObject({ ok: false, problem: { code: 'artifact-undeclared' } });
  });

  it('flags a comparison that points at an undeclared file', async () => {
    const directory = await writeTestBundle();
    const source = createDirectorySource(directory);
    const projectionText = (await readFile(join(directory, 'projection.json'), 'utf8')).replace('artifacts/actual.png', 'artifacts/unlisted.png');
    const memory = await replacingProjection(source, projectionText);

    const result = await openBundle(memory);

    if (result.status !== 'opened') throw new Error('expected the bundle to open');
    expect(result.problems).toEqual([expect.objectContaining({ code: 'artifact-undeclared', path: 'artifacts/unlisted.png' })]);
  });

  it('turns problems into integrity failures for computeValidity', () => {
    expect(toIntegrityFailures([{ code: 'file-missing', path: 'a.png', message: 'the file is declared but missing' }])).toEqual(['a.png: the file is declared but missing']);
  });
});

describe('the directory source', () => {
  it('refuses paths that leave the directory', async () => {
    const directory = await writeTestBundle();

    await expect(createDirectorySource(directory).read('../bundle.partial/x.png')).rejects.toThrow(/not a valid bundle path/);
    await expect(createDirectorySource(directory).read('/etc/hosts.json')).rejects.toThrow(/not a valid bundle path/);
  });

  it('refuses a symbolic link, even one that points inside the bundle', async () => {
    const directory = await writeTestBundle();
    await symlink(join(directory, 'artifacts/actual.png'), join(directory, 'artifacts/link.png'));

    await expect(createDirectorySource(directory).read('artifacts/link.png')).rejects.toThrow(/not a regular file/);
  });

  it('reports a missing file as missing', async () => {
    const directory = await writeTestBundle();

    await expect(createDirectorySource(directory).read('artifacts/none.png')).rejects.toBeInstanceOf(BundleFileMissingError);
  });
});

// A source that serves the bundle's files but with a different projection. The manifest hash is recomputed so
// the substitution reaches the artifact check rather than failing earlier.
async function replacingProjection(source: BundleSource, projectionText: string): Promise<BundleSource> {
  const manifest = JSON.parse(new TextDecoder().decode(await source.read('manifest.json'))) as BundleManifest;
  const bytes = new TextEncoder().encode(projectionText);
  const digest = Buffer.from(await crypto.subtle.digest('SHA-256', bytes)).toString('hex');
  const files = manifest.files.map((file) => (file.path === 'projection.json' ? { ...file, sha256: digest, bytes: bytes.byteLength } : file));
  const patched = { ...manifest, files, bundleHash: await computeBundleHash(files) };

  return {
    async read(path: string): Promise<Uint8Array> {
      if (path === 'manifest.json') return new TextEncoder().encode(JSON.stringify(patched));
      if (path === 'projection.json') return bytes;
      return source.read(path);
    }
  };
}
