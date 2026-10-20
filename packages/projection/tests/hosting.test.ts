import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { DecisionRequestError, evaluateDecision, buildDecisionBinding, openBundle, recordDecision, recordDecisionRequestSchema, releaseIndexSchema } from '../src/index.js';
import { createDirectorySource, writeBundle } from '../src/node/index.js';
import { cleanUpTempDirectories, generator, makeFiles, makeProjection, makeTempDirectory, release } from './helpers/bundle-builders.js';

afterAll(cleanUpTempDirectories);

async function storedBundle() {
  const directory = join(await makeTempDirectory(), 'bundle');
  await writeBundle({ directory, projection: makeProjection(), release, generator, files: makeFiles() });
  const result = await openBundle(createDirectorySource(directory));
  if (result.status !== 'opened') throw new Error('bundle did not open');
  return result.bundle;
}

const at = '2026-10-21T09:00:00.000Z';

describe('index.json', () => {
  it('lists bundles with their identity and names the latest per project explicitly', () => {
    const index = releaseIndexSchema.parse({
      schemaVersion: 1,
      generatedAt: at,
      bundles: [{ id: 'button-2026-10-20-1', project: 'marwes', release: 'button-2026-10-20', build: 1, state: 'candidate', builtAt: at, bundleHash: 'a'.repeat(64) }],
      latest: { marwes: 'button-2026-10-20-1' }
    });
    expect(index.archive).toEqual([]);
    expect(releaseIndexSchema.parse({ schemaVersion: 1, generatedAt: at, bundles: [] }).latest).toEqual({});
    expect(releaseIndexSchema.safeParse({ schemaVersion: 1, generatedAt: at, bundles: [{ id: 'x' }] }).success).toBe(false);
  });
});

describe('recording a decision on the server', () => {
  it('binds an approval to the stored content, takes the identity it is given, and records what it acknowledges', async () => {
    const bundle = await storedBundle();
    const decision = recordDecision({ request: { bundleId: bundle.manifest.release.bundleId, kind: 'approve', comment: 'Reads right.' }, bundle, identity: { email: 'designer@example.com' }, id: 'd-1', at });

    expect(decision).toMatchObject({ id: 'd-1', kind: 'approve', by: 'designer@example.com', attestation: 'human', comment: 'Reads right.', scope: { release: bundle.manifest.release.release } });
    expect(decision.acknowledged?.missing).toBeGreaterThanOrEqual(0);
    expect(evaluateDecision(decision, buildDecisionBinding(bundle.projection.requirements, bundle.projection.comparisons), bundle.manifest.release.bundleId)).toEqual({ state: 'holds' });
  });

  it('needs a message to require changes and a target to withdraw', () => {
    expect(recordDecisionRequestSchema.safeParse({ bundleId: 'b', kind: 'changes-required' }).success).toBe(false);
    expect(recordDecisionRequestSchema.safeParse({ bundleId: 'b', kind: 'changes-required', message: '  ' }).success).toBe(false);
    expect(recordDecisionRequestSchema.safeParse({ bundleId: 'b', kind: 'withdrawn' }).success).toBe(false);
  });

  it('refuses a request for another bundle and an invalid request, with a typed error', async () => {
    const bundle = await storedBundle();
    const call = (request: Parameters<typeof recordDecision>[0]['request']) => () => recordDecision({ request, bundle, identity: { email: 'a@example.com' }, id: 'd', at });

    expect(call({ bundleId: 'another-bundle', kind: 'approve' })).toThrow(DecisionRequestError);
    expect(call({ bundleId: 'another-bundle', kind: 'approve' })).toThrow(/stored bundle is/);
    expect(call({ bundleId: bundle.manifest.release.bundleId, kind: 'changes-required' } as never)).toThrow(/needs a message/);
  });

  it('records a withdrawal without a binding', async () => {
    const bundle = await storedBundle();
    const withdrawal = recordDecision({ request: { bundleId: bundle.manifest.release.bundleId, kind: 'withdrawn', target: 'd-1' }, bundle, identity: { email: 'a@example.com' }, id: 'd-2', at });
    expect(withdrawal).toMatchObject({ kind: 'withdrawn', target: 'd-1' });
    expect(withdrawal.binding).toBeUndefined();
  });
});
