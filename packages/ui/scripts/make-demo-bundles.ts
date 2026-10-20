// Writes demo bundles from the projection package's fixtures, with generated placeholder images, so the viewer
// can be tried and tested against every shape: a large Marwes family, a Sourcer page with unknown buckets, a
// native Reflection report, a project that has nothing to do with either, and two deliberately broken bundles.
// The Marwes and Sourcer bundles keep their real counts; only the images are generated.
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { PNG } from 'pngjs';
import { buildArchiveSummary, projectFromReflectionReport, projectionSchema, collectArtifactRefs, summarizeReadiness, type Projection, type ReleaseManifest } from 'reflection-projection';
import { writeBundle, type BundleFileInput } from 'reflection-projection/node';
import { buildFromSample, readFixture } from '../../projection/tests/helpers/builders';
import { screensDemo } from './demo-screens';

const DEFAULT_OUTPUT = '.demo-bundles';
const output = resolve(process.argv[2] ?? DEFAULT_OUTPUT);

interface Demo {
  id: string;
  projection: Projection;
  release?: Partial<ReleaseManifest>;
  // Images whose path contains this text are drawn in an older colour, so their hash differs from the current release.
  oldLook?: string;
}

const docsSite = withDemoCatalog(withDemoDelta(withDemoEvidence(projectionSchema.parse(readFixture('independent-docs-site.json')))));

const demos: Demo[] = [
  { id: 'marwes-button', projection: withRealSubject(buildFromSample('marwes-button.sample.json'), 'button') },
  { id: 'sourcer-login', projection: withRealSubject(buildFromSample('sourcer-login.sample.json'), 'login') },
  { id: 'native-basic-react', projection: projectFromReflectionReport(readFixture('native-basic-react.report.json') as never, { projectName: 'basic-react example' }) },
  { id: 'docs-site', projection: docsSite },
  // The release docs-site is compared with: released, with one reference drawn differently, one item the current
  // release added, one it removed, and a page that no longer exists.
  // The same site, but every item must pass in Chrome, Firefox and Safari. Nothing was ever compared in Safari.
  { id: 'docs-site-strict', projection: strictOf(docsSite) },
  { id: 'docs-site-previous', projection: previousOf(docsSite), release: { release: 'demo-0', state: 'released', previousRelease: null }, oldLook: 'hero.tablet' },
  // A page of 200 required items with a presentation hint and every outcome, and one where every check fails.
  { id: 'checkout-200', projection: screensDemo({ pageId: 'checkout', label: 'Checkout', appStates: 60, appDevices: ['desktop', 'tablet', 'mobile'], emailStates: 10, emailDevices: ['desktop', 'phone'], withHistory: true }) },
  { id: 'signup-all-failing', projection: screensDemo({ pageId: 'signup', label: 'Sign-up', appStates: 15, appDevices: ['desktop', 'mobile'], emailStates: 0, emailDevices: [], allFailing: true }) }
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

// A label, description, link and change note for the page, so the catalog fields can be seen. Illustrative.
function withDemoCatalog(projection: Projection): Projection {
  return projectionSchema.parse({
    ...projection,
    subjects: [{ id: 'pricing', kind: 'page', label: 'Pricing page', description: 'Plans and prices', sourceUrl: 'https://example.com/design/pricing', changeNote: 'Tablet hero redrawn, mobile FAQ added' }]
  });
}

// Every requirement now names the implementations that must pass. Illustrative.
function strictOf(projection: Projection): Projection {
  const copy = structuredClone(projection);
  return projectionSchema.parse({ ...copy, requirements: copy.requirements.map((requirement) => ({ ...requirement, requiredImplementations: ['chrome', 'firefox', 'safari'] })) });
}

// The previous release of the docs site, derived from the current one. Illustrative.
function previousOf(projection: Projection): Projection {
  const previous = structuredClone(projection);
  const dropped = 'pricing/faq-open.phone';
  const requirements = previous.requirements.filter((requirement) => requirement.id !== dropped);
  const comparisons = previous.comparisons.filter((comparison) => comparison.requirementId !== dropped);
  const sample = comparisons.find((comparison) => comparison.reference && comparison.actual);
  const extra = (id: string, subject: { kind: 'page'; id: string }): { requirement: Projection['requirements'][number]; comparison: Projection['comparisons'][number] } | undefined =>
    sample?.reference && sample.actual
      ? {
          requirement: { id, label: id, subject, requiredProofs: ['visual'], enrolled: true },
          comparison: {
            id: `${id}/chrome`,
            requirementId: id,
            subject: { ...subject, adapter: 'chrome' },
            ...(sample.snapshotId ? { snapshotId: sample.snapshotId } : {}),
            ...(sample.runId ? { runId: sample.runId } : {}),
            reference: { artifact: { role: 'reference', path: `legacy/${id}-reference.png` }, approval: { state: 'none' } },
            actual: { role: 'actual', path: `legacy/${id}-chrome.png` },
            proof: { visual: 'passed' },
            verdict: { status: 'pass', severity: 'review' }
          }
        }
      : undefined;
  const legacyBanner = extra('legacy-banner.desktop', { kind: 'page', id: 'pricing' });
  const checkout = extra('pay.desktop', { kind: 'page', id: 'checkout' });
  const { delta: _delta, ...rest } = previous;
  return projectionSchema.parse({
    ...rest,
    requirements: [...requirements, ...[legacyBanner, checkout].flatMap((entry) => (entry ? [entry.requirement] : []))],
    comparisons: [...comparisons, ...[legacyBanner, checkout].flatMap((entry) => (entry ? [entry.comparison] : []))]
  });
}

// Gives the failing docs-site comparison what a real one can carry, so the comparison view can be tried: a
// recorded diff image, measurements, and an implementation image of a different size than the reference.
// All illustrative; the other comparisons stay as the fixture has them.
function withDemoEvidence(projection: Projection): Projection {
  const target = projection.comparisons.find((comparison) => Object.values(comparison.proof).includes('failed'));
  if (!target) return projection;
  return projectionSchema.parse({
    ...projection,
    comparisons: projection.comparisons.map((comparison) =>
      comparison.id !== target.id || !comparison.reference || !comparison.actual
        ? comparison
        : {
            ...comparison,
            reference: { ...comparison.reference, artifact: { ...comparison.reference.artifact, width: 480, height: 300 } },
            actual: { ...comparison.actual, width: 456, height: 300 },
            diff: { artifact: { role: 'diff', path: 'demo/hero-phone-diff.png', width: 480, height: 300 }, metric: { name: 'diff-pixels', value: 1840, ratio: 0.0128, diffPixels: 1840 }, threshold: { maxDiffPixelRatio: 0.01 } },
            measurements: {
              total: 3,
              passed: 2,
              samples: [
                { part: 'heading', property: 'font-size', expected: '28px', actual: '26px', delta: '-2px', tolerance: '0.5px', passed: false },
                { part: 'cta', property: 'height', expected: '48px', actual: '48px', passed: true },
                { part: 'cta', property: 'padding-x', expected: '24px', actual: '24px', passed: true }
              ]
            },
            limitations: ['Illustrative demo data: these measurements were not produced by a real run']
          }
    )
  });
}

// The only demo with a delta against a previous release, so the viewer's "changes since" card can be seen.
// The entries are illustrative; the other demos have no delta and show no such card.
function withDemoDelta(projection: Projection): Projection {
  const firstFailing = projection.comparisons.find((comparison) => Object.values(comparison.proof).includes('failed'));
  return projectionSchema.parse({
    ...projection,
    delta: {
      against: 'demo-0',
      sameSnapshot: true,
      regressed: firstFailing ? [{ comparisonId: firstFailing.id }] : [],
      fixed: [],
      stillFailing: [],
      newlyEnrolled: [],
      newInDesign: [],
      stillProposed: [],
      removedInDesign: [],
      coverage: { before: null, after: summarizeReadiness(projection.requirements, projection.comparisons, projection.provider.readinessConcepts) }
    }
  });
}

if (output === resolve(DEFAULT_OUTPUT)) {
  await rm(output, { recursive: true, force: true });
}
await mkdir(output, { recursive: true });

for (const demo of demos) {
  await writeDemo(demo.id, demo.projection, demo.release ?? {}, demo.oldLook);
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

// Summaries of releases whose evidence was removed, so the history and the summary-only page can be seen.
await mkdir(join(output, 'archive'), { recursive: true });
const archived = [
  { projection: previousOf(docsSite), release: 'demo-older', decision: { kind: 'approve' as const, by: 'designer@example.com', at: '2026-10-02T12:00:00.000Z', message: 'Pricing reads right', standing: 'holds' as const } },
  { projection: previousOf(docsSite), release: 'demo-oldest', decision: null }
];
for (const [index, entry] of archived.entries()) {
  const projection = projectionSchema.parse({
    ...entry.projection,
    release: { release: entry.release, build: 1, bundleId: `docs-site-${entry.release}-1`, state: 'released', builtAt: '2026-09-20T12:00:00.000Z', previousRelease: index === 0 ? 'demo-oldest' : null, snapshotIds: entry.projection.snapshots.map((snapshot) => snapshot.id) },
    delta: undefined
  });
  const summary = buildArchiveSummary({
    projection,
    bundleHash: 'a'.repeat(63) + String(index),
    finalState: 'released',
    decision: entry.decision,
    notes: { open: index === 0 ? 1 : 0, resolved: index === 0 ? 3 : 0 },
    removed: { at: `2026-10-0${index + 5}T00:00:00.000Z`, reason: 'Left the previous-release slot' }
  });
  await writeFile(join(output, 'archive', `docs-site-${entry.release}.json`), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
}

console.log(`Wrote ${demos.length + 2} demo bundles and ${archived.length} archive summaries to ${output}`);

async function writeDemo(id: string, projection: Projection, overrides: Partial<ReleaseManifest>, oldLook: string | undefined): Promise<void> {
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
    files.push({ path: flat, kind: 'artifact', content: makePng(width, Math.max(height, 40), artifact.role, oldLook !== undefined && artifact.role === 'reference' && artifact.path.includes(oldLook)) });
    written.set(artifact.path, flat);
    artifact.path = flat;
  }
  const release: ReleaseManifest = {
    release: 'demo',
    build: 1,
    bundleId: `${id}-demo-1`,
    state: 'candidate',
    builtAt: '2026-10-18T12:00:00.000Z',
    previousRelease: projection.delta?.against ?? null,
    snapshotIds: projection.snapshots.map((snapshot) => snapshot.id),
    ...overrides
  };
  await writeBundle({ directory: join(output, id), projection, release, generator: { name: 'make-demo-bundles' }, files });
}

function safeSegment(segment: string): string {
  return segment.replace(/[^A-Za-z0-9._-]/g, '-');
}

// Placeholder pictures: a plain stage with one button-like block. Failing-looking actual images are not faked;
// the demo only needs images that exist, verify and differ by role.
function makePng(width: number, height: number, role: string, older = false): Buffer {
  const png = new PNG({ width, height });
  const [r, g, b] = older ? [147, 51, 234] : role === 'reference' ? [37, 99, 235] : role === 'diff' ? [220, 38, 38] : [22, 163, 74];
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
