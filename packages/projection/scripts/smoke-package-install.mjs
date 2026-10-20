// Proves the package works as installed: packs it, installs the tarball into an empty project, and runs a small
// provider flow (write a bundle, open it, read the JSON Schema) through the public entry points.
import { execFile } from 'node:child_process';
import { mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const packageRoot = fileURLToPath(new URL('../', import.meta.url));
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const packDir = await mkdtemp(join(tmpdir(), 'reflection-projection-pack-'));
const consumerDir = await mkdtemp(join(tmpdir(), 'reflection-projection-consumer-'));

await run('pnpm', ['pack', '--pack-destination', packDir], packageRoot);
const tarball = (await readdir(packDir)).find((file) => file.endsWith('.tgz'));
if (!tarball) throw new Error(`No tarball was written to ${packDir}.`);

await writeFile(join(consumerDir, 'package.json'), JSON.stringify({ name: 'projection-consumer-smoke', private: true, type: 'module' }, null, 2));
await run('pnpm', ['add', join(packDir, tarball)], consumerDir);
await writeFile(
  join(consumerDir, 'flow.mjs'),
  `import { join } from 'node:path';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { openBundle, projectionSchema, summarizeProjection } from 'reflection-projection';
import { createDirectorySource, writeBundle } from 'reflection-projection/node';
import schema from 'reflection-projection/schema' with { type: 'json' };

const projection = projectionSchema.parse({
  schemaVersion: 1,
  project: { id: 'smoke', name: 'Smoke' },
  provider: { name: 'smoke', readinessConcepts: { needsDesign: false, notEnrolled: false } },
  generatedAt: '2026-10-19T00:00:00.000Z',
  inventory: 'full',
  requirements: [{ id: 'a', subject: { kind: 'page', id: 'home' }, requiredProofs: ['visual'], enrolled: true }],
  comparisons: [{ id: 'a/chrome', requirementId: 'a', subject: { kind: 'page', id: 'home', adapter: 'chrome' }, actual: { role: 'actual', path: 'artifacts/a.png' }, proof: { visual: 'passed' }, verdict: { status: 'pass', severity: 'review' } }]
});
const release = { release: '1.0.0', build: 1, bundleId: 'smoke-1', state: 'candidate', builtAt: '2026-10-19T00:00:00.000Z', previousRelease: null, snapshotIds: [] };
const directory = join(await mkdtemp(join(tmpdir(), 'smoke-bundle-')), 'bundle');
await writeBundle({ directory, projection, release, generator: { name: 'smoke' }, files: [{ path: 'artifacts/a.png', kind: 'artifact', content: new Uint8Array([1, 2, 3]) }] });
const result = await openBundle(createDirectorySource(directory), { verifyFiles: 'all' });
if (result.status !== 'opened' || result.problems.length > 0) throw new Error('the bundle did not open cleanly: ' + JSON.stringify(result));
const summary = summarizeProjection(result.bundle.projection);
if (summary.required !== 1 || summary.proven !== 1) throw new Error('unexpected summary ' + JSON.stringify(summary));
if (!schema.properties || !schema.properties.requirements) throw new Error('the JSON Schema export is wrong');
console.log('flow ok');
`
);
await run('node', ['flow.mjs'], consumerDir);

// The built viewer ships as static files a host copies as they are; its assets must be relative to it.
const viewerPage = await readFile(join(consumerDir, 'node_modules', 'reflection-projection', 'viewer', 'index.html'), 'utf8');
if (!viewerPage.includes('src="./assets/')) throw new Error('the packaged viewer does not load its assets relative to itself');
console.log('viewer ok');

console.log(`Package install smoke passed for ${packageJson.name}@${packageJson.version}`);
console.log(`Tarball: ${join(packDir, tarball)}`);

async function run(command, args, cwd) {
  try {
    const result = await execFileAsync(command, args, { cwd, maxBuffer: 10 * 1024 * 1024 });
    if (result.stdout.trim().length > 0 && command === 'node') console.log(result.stdout.trim());
  } catch (error) {
    throw new Error(`${command} ${args.join(' ')} failed in ${cwd}:\n${error.stdout ?? ''}\n${error.stderr ?? ''}`);
  }
}
