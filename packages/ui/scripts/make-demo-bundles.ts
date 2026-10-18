// Writes demo bundles from the projection package's fixtures, with generated placeholder images, so the viewer
// can be tried and tested against every shape: a large Marwes family, a Sourcer page with unknown buckets, a
// native Reflection report, a project that has nothing to do with either, and two deliberately broken bundles.
// The Marwes and Sourcer bundles keep their real counts; only the images are generated.
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { PNG } from 'pngjs';
import { projectFromReflectionReport, projectionSchema, collectArtifactRefs, type Projection, type ReleaseManifest } from 'reflection-projection';
import { writeBundle, type BundleFileInput } from 'reflection-projection/node';
import { buildFromSample, readFixture } from '../../projection/tests/helpers/builders';

const DEFAULT_OUTPUT = '.demo-bundles';
const output = resolve(process.argv[2] ?? DEFAULT_OUTPUT);

interface Demo {
  id: string;
  projection: Projection;
}

const demos: Demo[] = [
  { id: 'marwes-button', projection: withRealSubject(buildFromSample('marwes-button.sample.json'), 'button') },
  { id: 'sourcer-login', projection: withRealSubject(buildFromSample('sourcer-login.sample.json'), 'login') },
  { id: 'native-basic-react', projection: projectFromReflectionReport(readFixture('native-basic-react.report.json') as never, { projectName: 'basic-react example' }) },
  { id: 'docs-site', projection: projectionSchema.parse(readFixture('independent-docs-site.json')) }
];

// The sample's placeholder requirements stand in for items that were counted but not itemised. Give them the
// sample's real subject so the family shows its true totals.
function withRealSubject(projection: Projection, subjectId: string): Projection {
  return {
    ...projection,
    requirements: projection.requirements.map((requirement) => (requirement.subject.id === 'placeholder' ? { ...requirement, subject: { ...requirement.subject, id: subjectId } } : requirement)),
    comparisons: projection.comparisons.map((comparison) => (comparison.subject.id === 'placeholder' ? { ...comparison, subject: { ...comparison.subject, id: subjectId } } : comparison))
  };
}

if (output === resolve(DEFAULT_OUTPUT)) {
  await rm(output, { recursive: true, force: true });
}
await mkdir(output, { recursive: true });

for (const demo of demos) {
  await writeDemo(demo.id, demo.projection);
}

// Two broken copies, to try the designed states: an image that no longer matches its hash, and a manifest
// that was edited after it was written.
await cp(join(output, 'docs-site'), join(output, 'docs-site-tampered-image'), { recursive: true });
const [firstImage] = collectArtifactRefs(demos[3]!.projection);
if (firstImage) {
  await writeFile(join(output, 'docs-site-tampered-image', firstImage.path), makePng(64, 32, 'actual'));
}
await cp(join(output, 'docs-site'), join(output, 'docs-site-rejected'), { recursive: true });
const manifestPath = join(output, 'docs-site-rejected', 'manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as { release: { release: string } };
manifest.release.release = 'edited-after-publishing';
await writeFile(manifestPath, JSON.stringify(manifest, null, 2));

console.log(`Wrote ${demos.length + 2} demo bundles to ${output}`);

async function writeDemo(id: string, projection: Projection): Promise<void> {
  const artifacts = collectArtifactRefs(projection);
  // Real hashes belong to images that are not here; the writer fills in the hashes of the generated ones.
  for (const artifact of artifacts) {
    delete artifact.sha256;
    delete artifact.bytes;
  }

  const written = new Map<string, string>();
  const files: BundleFileInput[] = [];
  for (const artifact of artifacts) {
    const existing = written.get(artifact.path);
    if (existing) {
      artifact.path = existing;
      continue;
    }
    const flat = `artifacts/${artifact.path.replace(/^\/+/, '').split('/').map(safeSegment).join('/')}`;
    const width = Math.min(artifact.width ?? 320, 480);
    const height = Math.round((width * (artifact.height ?? 120)) / (artifact.width ?? 320));
    files.push({ path: flat, kind: 'artifact', content: makePng(width, Math.max(height, 40), artifact.role) });
    written.set(artifact.path, flat);
    artifact.path = flat;
  }
  const release: ReleaseManifest = {
    release: 'demo',
    build: 1,
    bundleId: `${id}-demo-1`,
    state: 'candidate',
    builtAt: '2026-10-18T12:00:00.000Z',
    previousRelease: null,
    snapshotIds: projection.snapshots.map((snapshot) => snapshot.id)
  };
  await writeBundle({ directory: join(output, id), projection, release, generator: { name: 'make-demo-bundles' }, files });
}

function safeSegment(segment: string): string {
  return segment.replace(/[^A-Za-z0-9._-]/g, '-');
}

// Placeholder pictures: a plain stage with one button-like block. Failing-looking actual images are not faked;
// the demo only needs images that exist, verify and differ by role.
function makePng(width: number, height: number, role: string): Buffer {
  const png = new PNG({ width, height });
  const [r, g, b] = role === 'reference' ? [37, 99, 235] : role === 'diff' ? [220, 38, 38] : [22, 163, 74];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const inBlock = x > width * 0.25 && x < width * 0.75 && y > height * 0.3 && y < height * 0.7;
      const offset = (y * width + x) * 4;
      png.data[offset] = inBlock ? r : 244;
      png.data[offset + 1] = inBlock ? g : 244;
      png.data[offset + 2] = inBlock ? b : 245;
      png.data[offset + 3] = 255;
    }
  }
  return PNG.sync.write(png);
}
