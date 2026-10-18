import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll } from 'vitest';
import { collectArtifactRefs, projectionSchema, type Projection, type ReleaseManifest } from 'reflection-projection';
import { createDirectorySource, writeBundle, type BundleFileInput } from 'reflection-projection/node';
import type { BundleCatalog } from '../../src/data/bundle-catalog';

type RequirementInput = Projection['requirements'][number];
type ComparisonInput = Projection['comparisons'][number];

const png = (role: string): Uint8Array => new Uint8Array([137, 80, 78, 71, role.length]);

function requirement(id: string, overrides: Partial<RequirementInput> = {}): RequirementInput {
  return { id, label: id, subject: { kind: 'page', id: 'pricing', state: id.split('.')[0] ?? id, viewport: id.split('.')[1] ?? 'desktop' }, requiredProofs: ['visual'], enrolled: true, ...overrides } as RequirementInput;
}

function comparison(requirementId: string, adapter: string, outcome: 'passed' | 'failed' | 'not-run'): ComparisonInput {
  const proof = outcome === 'not-run' ? {} : { visual: outcome };
  return {
    id: `${requirementId}/${adapter}`,
    requirementId,
    subject: { kind: 'page', id: 'pricing', adapter },
    snapshotId: 'references',
    runId: 'run-1',
    reference: { artifact: { role: 'reference', path: `artifacts/${requirementId}-reference.png` }, approval: { state: 'holds', attestation: 'human', by: 'reviewer@example.com', at: '2026-10-14T09:00:00.000Z' } },
    actual: { role: 'actual', path: `artifacts/${requirementId}-${adapter}.png` },
    proof,
    verdict: { status: outcome === 'passed' ? 'pass' : outcome === 'failed' ? 'fail' : 'skipped', severity: 'blocking' }
  } as ComparisonInput;
}

/** One page with an item in every outcome group: failed, not proven, passed and two kinds of missing. */
export function makeProjection(overrides: Partial<Pick<Projection, 'provider' | 'inventory' | 'runs'>> = {}): Projection {
  // A comparison cannot name a run that does not exist.
  const dropRunIds = (entries: ComparisonInput[]): ComparisonInput[] => (overrides.runs?.length === 0 ? entries.map(({ runId: _runId, ...rest }) => rest) : entries);
  return projectionSchema.parse({
    schemaVersion: 1,
    project: { id: 'docs-site', name: 'Docs site' },
    provider: { name: 'test-provider', readinessConcepts: { needsDesign: true, notEnrolled: true } },
    generatedAt: '2026-10-18T09:00:00.000Z',
    inventory: 'full',
    snapshots: [{ id: 'references', kind: 'reference-set', role: 'reference-screenshots', label: 'Reference screenshots', capturedAt: '2026-10-14T08:00:00.000Z' }],
    runs: [{ id: 'run-1', finishedAt: '2026-10-15T08:00:00.000Z', engine: { name: 'screenshot-compare', version: '2.1.0' } }],
    requirements: [
      requirement('hero.desktop'),
      requirement('hero.phone'),
      requirement('faq.desktop'),
      requirement('banner.desktop'),
      requirement('promo.desktop', { enrolled: false, design: { availability: 'missing', reason: 'No design has been selected for the promo banner' } }),
      requirement('footer.desktop', { enrolled: false })
    ],
    comparisons: dropRunIds([
      comparison('hero.desktop', 'chrome', 'passed'),
      comparison('hero.desktop', 'firefox', 'passed'),
      comparison('hero.phone', 'chrome', 'failed'),
      comparison('hero.phone', 'firefox', 'passed'),
      comparison('faq.desktop', 'chrome', 'passed'),
      comparison('faq.desktop', 'firefox', 'not-run')
    ]),
    ...overrides
  });
}

export const release: ReleaseManifest = {
  release: '2.4.0',
  build: 1,
  bundleId: 'docs-site-2.4.0-1',
  state: 'candidate',
  builtAt: '2026-10-18T10:00:00.000Z',
  previousRelease: null,
  snapshotIds: ['references']
};

export interface TestBundle {
  id: string;
  projection: Projection;
  // Runs after the bundle is written, to break it on purpose.
  damage?: (directory: string) => Promise<void>;
}

const created: string[] = [];
afterAll(async () => {
  await Promise.all(created.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

/** Writes real bundles to a temporary directory and serves them as a catalog, so tests read what the writer wrote. */
export async function makeCatalog(bundles: TestBundle[]): Promise<BundleCatalog> {
  const root = await mkdtemp(join(tmpdir(), 'reflection-ui-'));
  created.push(root);

  for (const bundle of bundles) {
    const files: BundleFileInput[] = [...new Set(collectArtifactRefs(bundle.projection).map((artifact) => artifact.path))].map((path) => ({ path, kind: 'artifact', content: png(path) }));
    await writeBundle({ directory: join(root, bundle.id), projection: bundle.projection, release, generator: { name: 'ui-tests' }, files });
    await bundle.damage?.(join(root, bundle.id));
  }

  return {
    list: async () => bundles.map((bundle) => ({ id: bundle.id })),
    source: (bundleId) => createDirectorySource(join(root, bundleId))
  };
}

export async function overwrite(directory: string, path: string, content: string | Uint8Array): Promise<void> {
  await writeFile(join(directory, path), content);
}
