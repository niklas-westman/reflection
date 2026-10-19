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
  // Overrides for the release record, for example a branch and commit.
  release?: Partial<ReleaseManifest>;
  // What to write for an image, when it should differ from the default (to make a reference "change").
  imageContent?: (path: string) => Uint8Array;
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
    const files: BundleFileInput[] = [...new Set(collectArtifactRefs(bundle.projection).map((artifact) => artifact.path))].map((path) => ({ path, kind: 'artifact', content: bundle.imageContent?.(path) ?? png(path) }));
    await writeBundle({ directory: join(root, bundle.id), projection: bundle.projection, release: { ...release, snapshotIds: bundle.projection.snapshots.map((snapshot) => snapshot.id), ...bundle.release }, generator: { name: 'ui-tests' }, files });
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

interface ComponentCase {
  variant: string;
  state: string;
  mode: string;
  // Outcome per implementation; an implementation left out was not compared.
  results: Record<string, 'passed' | 'failed' | 'not-run'>;
  design?: 'missing';
}

const BUTTON_CASES: ComponentCase[] = [
  { variant: 'primary', state: 'default', mode: 'light', results: { react: 'passed', vue: 'passed', svelte: 'passed' } },
  { variant: 'primary', state: 'hover', mode: 'light', results: { react: 'failed', vue: 'passed', svelte: 'passed' } },
  { variant: 'secondary', state: 'default', mode: 'light', results: { react: 'passed' } },
  { variant: 'secondary', state: 'hover', mode: 'light', results: { react: 'passed', vue: 'not-run' } },
  { variant: 'primary', state: 'default', mode: 'dark', results: {}, design: 'missing' }
];

/**
 * One component family with three implementations and a deliberately incomplete grid: not every combination of
 * variant, state and mode exists, one item fails in one implementation, one has no design, and some
 * implementations were never compared.
 */
export function makeComponentProjection(): Projection {
  const requirements = BUTTON_CASES.map((entry) => {
    const id = `button.${entry.variant}.${entry.state}.${entry.mode}`;
    return {
      id,
      label: `${entry.variant} ${entry.state} ${entry.mode}`,
      subject: { kind: 'component', id: 'button', variant: entry.variant, state: entry.state, mode: entry.mode },
      requiredProofs: ['structural', 'visual'],
      enrolled: entry.design !== 'missing',
      ...(entry.design === 'missing' ? { design: { availability: 'missing', reason: 'No dark design exists yet' } } : {})
    };
  });
  const comparisons = BUTTON_CASES.flatMap((entry) =>
    Object.entries(entry.results).map(([adapter, outcome]) => {
      const requirementId = `button.${entry.variant}.${entry.state}.${entry.mode}`;
      const proof = outcome === 'not-run' ? {} : { structural: outcome, visual: outcome };
      return {
        id: `${requirementId}/${adapter}`,
        requirementId,
        subject: { kind: 'component', id: 'button', variant: entry.variant, state: entry.state, mode: entry.mode, adapter, viewport: '1440x900' },
        snapshotId: 'design-sync',
        runId: 'run-1',
        reference: { artifact: { role: 'reference', path: `artifacts/${requirementId}-reference.png` }, baselineCreatedAt: '2026-10-12T09:00:00.000Z', approval: { state: 'holds', attestation: 'human', by: 'reviewer@example.com', at: '2026-10-14T09:00:00.000Z' } },
        actual: { role: 'actual', path: `artifacts/${requirementId}-${adapter}.png` },
        ...(outcome === 'failed' ? { diff: { metric: { name: 'diff-pixels', value: 12 }, threshold: { ratio: 0.01 } } } : {}),
        proof,
        verdict: { status: outcome === 'passed' ? 'pass' : outcome === 'failed' ? 'fail' : 'skipped', severity: 'blocking' }
      };
    })
  );
  return projectionSchema.parse({
    schemaVersion: 1,
    project: { id: 'marwes-like', name: 'Components' },
    provider: { name: 'test-provider', readinessConcepts: { needsDesign: true, notEnrolled: true } },
    generatedAt: '2026-10-18T09:00:00.000Z',
    inventory: 'full',
    snapshots: [{ id: 'design-sync', kind: 'design-file', role: 'design-source', label: 'Design file', capturedAt: '2026-10-14T08:00:00.000Z' }],
    runs: [{ id: 'run-1', finishedAt: '2026-10-16T08:00:00.000Z', engine: { name: 'reflection-check', version: '0.6.0' } }],
    requirements,
    comparisons
  });
}

/**
 * One component with the shapes the inspector has to handle: a failing comparison with measurements and a
 * recorded diff, one whose implementation image has a different size, a passing one that recorded nothing
 * beyond its images, and one with no reference at all.
 */
export function makeInspectorProjection(): Projection {
  const approval = { state: 'holds', attestation: 'human', by: 'reviewer@example.com', at: '2026-10-14T09:00:00.000Z' };
  const requirement = (id: string, variant: string) => ({ id, label: `${variant} default`, subject: { kind: 'component', id: 'button', variant, state: 'default' }, requiredProofs: ['structural', 'visual'], enrolled: true });
  const subject = (variant: string, adapter: string) => ({ kind: 'component', id: 'button', variant, state: 'default', mode: 'light', adapter, viewport: '1440x900' });
  const sha = (character: string) => character.repeat(64);

  return projectionSchema.parse({
    schemaVersion: 1,
    project: { id: 'inspect', name: 'Inspector fixture' },
    provider: { name: 'test-provider', readinessConcepts: { needsDesign: true, notEnrolled: true } },
    generatedAt: '2026-10-18T09:00:00.000Z',
    inventory: 'full',
    snapshots: [{ id: 'design-sync', kind: 'design-file', role: 'design-source', label: 'Design file', capturedAt: '2026-10-14T08:00:00.000Z', fileKey: 'FILE-KEY-123' }],
    runs: [{ id: 'run-1', finishedAt: '2026-10-16T08:00:00.000Z', engine: { name: 'reflection-check', version: '0.6.0' }, runner: { browser: 'chromium 140', platform: 'linux' } }],
    requirements: [requirement('btn.primary', 'primary'), requirement('btn.secondary', 'secondary'), requirement('btn.ghost', 'ghost'), requirement('btn.outline', 'outline')],
    comparisons: [
      {
        id: 'btn.primary/react',
        requirementId: 'btn.primary',
        subject: subject('primary', 'react'),
        snapshotId: 'design-sync',
        runId: 'run-1',
        sourceNodeIds: ['1362:7471'],
        capturePolicyHash: sha('c'),
        reference: { artifact: { role: 'reference', path: 'artifacts/primary-reference.png', width: 400, height: 200 }, baselineSha256: sha('b'), approval },
        actual: { role: 'actual', path: 'artifacts/primary-react.png', width: 400, height: 200 },
        diff: { artifact: { role: 'diff', path: 'artifacts/primary-diff.png' }, metric: { name: 'diff-pixels', value: 120, ratio: 0.0015, diffPixels: 120 }, threshold: { ratio: 0.001 } },
        measurements: {
          total: 4,
          passed: 2,
          samples: [
            { part: 'label', property: 'padding-x', expected: '16px', actual: '14px', delta: '-2px', tolerance: '0.5px', passed: false },
            { part: 'label', property: 'font-size', expected: '14px', actual: '14px', passed: true },
            { part: 'root', property: 'height', expected: '40px', actual: '40px', passed: true },
            { part: 'root', property: 'radius', expected: '6px', actual: '4px', passed: false }
          ]
        },
        limitations: ['Hover styles are not captured'],
        proof: { structural: 'failed', visual: 'failed' },
        verdict: { status: 'fail', severity: 'blocking', failureClass: 'measurement' }
      },
      {
        id: 'btn.primary/vue',
        requirementId: 'btn.primary',
        subject: subject('primary', 'vue'),
        snapshotId: 'design-sync',
        runId: 'run-1',
        reference: { artifact: { role: 'reference', path: 'artifacts/primary-reference.png', width: 400, height: 200 }, approval },
        actual: { role: 'actual', path: 'artifacts/primary-vue.png', width: 400, height: 200 },
        proof: { structural: 'passed', visual: 'passed' },
        verdict: { status: 'pass', severity: 'review' }
      },
      {
        id: 'btn.secondary/react',
        requirementId: 'btn.secondary',
        subject: subject('secondary', 'react'),
        snapshotId: 'design-sync',
        runId: 'run-1',
        reference: { artifact: { role: 'reference', path: 'artifacts/secondary-reference.png', width: 400, height: 200 }, approval },
        actual: { role: 'actual', path: 'artifacts/secondary-react.png', width: 380, height: 200 },
        proof: { structural: 'passed', visual: 'passed' },
        verdict: { status: 'pass', severity: 'review' }
      },
      {
        id: 'btn.ghost/react',
        requirementId: 'btn.ghost',
        subject: subject('ghost', 'react'),
        runId: 'run-1',
        actual: { role: 'actual', path: 'artifacts/ghost-react.png' },
        proof: { visual: 'not-run' },
        verdict: { status: 'skipped', severity: 'info' }
      }
    ]
  });
}

/**
 * Two releases of one project. Compared with the previous one, the current has: a component whose reference
 * changed (button, primary default light), one added item (secondary hover light), one removed item (legacy),
 * a new component (select) and a removed page (checkout).
 */
export function makeReleasePair(): { previous: TestBundle; current: TestBundle } {
  const current = makeComponentProjection();
  const select = {
    requirement: { id: 'select.default', label: 'select default', subject: { kind: 'component', id: 'select', variant: 'default' }, requiredProofs: ['visual'], enrolled: true },
    comparison: {
      id: 'select.default/react',
      requirementId: 'select.default',
      subject: { kind: 'component', id: 'select', adapter: 'react' },
      snapshotId: 'design-sync',
      runId: 'run-1',
      reference: { artifact: { role: 'reference', path: 'artifacts/select.default-reference.png' }, approval: { state: 'none' } },
      actual: { role: 'actual', path: 'artifacts/select.default-react.png' },
      proof: { visual: 'passed' },
      verdict: { status: 'pass', severity: 'review' }
    }
  };
  const currentProjection = projectionSchema.parse({ ...current, requirements: [...current.requirements, select.requirement], comparisons: [...current.comparisons, select.comparison] });

  const legacy = {
    requirement: { id: 'button.legacy.default.light', label: 'legacy default light', subject: { kind: 'component', id: 'button', variant: 'legacy', state: 'default', mode: 'light' }, requiredProofs: ['structural', 'visual'], enrolled: true },
    comparison: {
      id: 'button.legacy.default.light/react',
      requirementId: 'button.legacy.default.light',
      subject: { kind: 'component', id: 'button', variant: 'legacy', state: 'default', mode: 'light', adapter: 'react' },
      snapshotId: 'design-sync',
      runId: 'run-1',
      reference: { artifact: { role: 'reference', path: 'artifacts/legacy-reference.png' }, approval: { state: 'none' } },
      actual: { role: 'actual', path: 'artifacts/legacy-react.png' },
      proof: { structural: 'passed', visual: 'passed' },
      verdict: { status: 'pass', severity: 'review' }
    }
  };
  const checkout = {
    requirement: { id: 'checkout.pay', label: 'pay', subject: { kind: 'page', id: 'checkout', state: 'pay' }, requiredProofs: ['visual'], enrolled: true },
    comparison: {
      id: 'checkout.pay/chrome',
      requirementId: 'checkout.pay',
      subject: { kind: 'page', id: 'checkout', adapter: 'chrome' },
      snapshotId: 'design-sync',
      runId: 'run-1',
      reference: { artifact: { role: 'reference', path: 'artifacts/checkout-reference.png' }, approval: { state: 'none' } },
      actual: { role: 'actual', path: 'artifacts/checkout-chrome.png' },
      proof: { visual: 'passed' },
      verdict: { status: 'pass', severity: 'review' }
    }
  };
  const keep = (id: string | undefined): boolean => id !== 'button.secondary.hover.light';
  const previousProjection = projectionSchema.parse({
    ...current,
    requirements: [...current.requirements.filter((entry) => keep(entry.id)), legacy.requirement, checkout.requirement],
    comparisons: [...current.comparisons.filter((entry) => keep(entry.requirementId)), legacy.comparison, checkout.comparison]
  });

  const previousRelease = { release: '2.3.0', state: 'released' as const, build: 1, bundleId: 'components-2.3.0-1', previousRelease: null };
  return {
    previous: {
      id: 'previous',
      projection: previousProjection,
      release: previousRelease,
      // The reference of button primary default light was a different picture in 2.3.0.
      imageContent: (path) => (path === 'artifacts/button.primary.default.light-reference.png' ? new Uint8Array([9, 9, 9, 9]) : new Uint8Array([137, 80, 78, 71, path.length]))
    },
    current: { id: 'current', projection: currentProjection, release: { release: '2.4.0', state: 'candidate', build: 1, bundleId: 'components-2.4.0-1', previousRelease: '2.3.0' } }
  };
}
