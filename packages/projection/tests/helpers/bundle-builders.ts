import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach } from 'vitest';
import type { BundleFileInput } from '../../src/node/index.js';
import { projectionSchema, type Projection, type ReleaseManifest } from '../../src/index.js';

export const release: ReleaseManifest = {
  release: '2.4.0',
  build: 1,
  bundleId: 'marwes-2.4.0-build-1',
  state: 'candidate',
  builtAt: '2026-10-18T10:00:00.000Z',
  previousRelease: null,
  snapshotIds: ['figma-sync']
};

export const generator = { name: 'bundle-test', version: '0.0.0' };

export function makeProjection(): Projection {
  const artifact = (role: 'reference' | 'actual' | 'diff', path: string) => ({ role, path });
  return projectionSchema.parse({
    schemaVersion: 1,
    project: { id: 'marwes', name: 'Marwes' },
    provider: { name: 'test-provider', readinessConcepts: { needsDesign: false, notEnrolled: false } },
    generatedAt: '2026-10-18T09:00:00.000Z',
    inventory: 'full',
    snapshots: [{ id: 'figma-sync', kind: 'design-file', role: 'full-sync', capturedAt: '2026-10-14T08:00:00.000Z' }],
    requirements: [{ id: 'button/primary', subject: { kind: 'component', id: 'button' }, requiredProofs: ['visual'], enrolled: true }],
    runs: [{ id: 'run-1', finishedAt: '2026-10-18T09:00:00.000Z', engine: { name: 'reflection-check' } }],
    comparisons: [
      {
        id: 'button/primary/react',
        requirementId: 'button/primary',
        subject: { kind: 'component', id: 'button' },
        runId: 'run-1',
        reference: { artifact: artifact('reference', 'artifacts/reference.png'), approval: { state: 'none' } },
        actual: artifact('actual', 'artifacts/actual.png'),
        diff: { artifact: artifact('diff', 'artifacts/diff.png'), metric: { name: 'diff-pixels', value: 12 } },
        proof: { visual: 'failed' },
        verdict: { status: 'fail', severity: 'blocking' }
      }
    ]
  });
}

export function makeFiles(): BundleFileInput[] {
  return [
    { path: 'artifacts/reference.png', kind: 'artifact', content: new Uint8Array([1, 2, 3]) },
    { path: 'artifacts/actual.png', kind: 'artifact', content: new Uint8Array([4, 5, 6]) },
    { path: 'artifacts/diff.png', kind: 'artifact', content: new Uint8Array([7, 8, 9]) },
    { path: 'source/snapshot.json', kind: 'source', content: '{"components":[]}' }
  ];
}

const created: string[] = [];

export async function makeTempDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'reflection-bundle-'));
  created.push(directory);
  return directory;
}

export function cleanUpTempDirectories(): void {
  afterEach(async () => {
    await Promise.all(created.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
  });
}
