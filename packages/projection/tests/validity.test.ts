import { describe, expect, it } from 'vitest';
import { computeValidity, type ReportInput } from '../src/index.js';

const a = 'a'.repeat(64);
const b = 'b'.repeat(64);

function input(key: string, sha256: string | undefined, overrides: Partial<ReportInput> = {}): ReportInput {
  return { role: 'source', key, hashKind: 'bytes', ...(sha256 ? { sha256 } : {}), ...overrides };
}

describe('computeValidity', () => {
  it('is current when every recorded input still matches', () => {
    expect(computeValidity([input('tokens.json', a)], [input('tokens.json', a)])).toEqual({ state: 'current' });
  });

  it('is stale and names exactly which inputs changed, were added or were removed', () => {
    const recorded = [input('tokens.json', a), input('old.json', a)];
    const current = [input('tokens.json', b), input('new.json', a)];

    expect(computeValidity(recorded, current)).toEqual({
      state: 'stale',
      causes: [
        { role: 'source', key: 'new.json', change: 'added' },
        { role: 'source', key: 'old.json', change: 'removed' },
        { role: 'source', key: 'tokens.json', change: 'changed' }
      ]
    });
  });

  it('treats a file that is now absent as removed, and one that was absent and now exists as added', () => {
    expect(computeValidity([input('x', a)], [input('x', undefined, { missing: true })])).toMatchObject({ causes: [{ key: 'x', change: 'removed' }] });
    expect(computeValidity([input('x', undefined, { missing: true })], [input('x', a)])).toMatchObject({ causes: [{ key: 'x', change: 'added' }] });
    expect(computeValidity([input('x', undefined, { missing: true })], [input('x', undefined, { missing: true })])).toEqual({ state: 'current' });
  });

  it('treats a different hash kind as a change, because the two hashes are not comparable', () => {
    expect(computeValidity([input('x', a)], [input('x', a, { hashKind: 'canonical-json' })])).toMatchObject({ state: 'stale' });
  });

  it('compares a composite input like any other: a changed composite hash makes the run stale', () => {
    const composite = (sha256: string) => ({ role: 'app', key: 'app:src,public,index.html', hashKind: 'composite' as const, sha256 });
    expect(computeValidity([composite(a)], [composite(a)])).toEqual({ state: 'current' });
    expect(computeValidity([composite(a)], [composite(b)])).toEqual({ state: 'stale', causes: [{ role: 'app', key: 'app:src,public,index.html', change: 'changed' }] });
  });

  it('keeps the same key under different roles apart', () => {
    const recorded = [input('x', a, { role: 'baseline' }), input('x', a, { role: 'source' })];
    const current = [input('x', b, { role: 'source' }), input('x', a, { role: 'baseline' })];

    expect(computeValidity(recorded, current)).toEqual({ state: 'stale', causes: [{ role: 'source', key: 'x', change: 'changed' }] });
  });

  it('is never-run when nothing was recorded, and offline when there is nothing current to compare', () => {
    expect(computeValidity(undefined, [input('x', a)])).toEqual({ state: 'never-run' });
    expect(computeValidity([input('x', a)], undefined)).toEqual({ state: 'offline' });
  });

  it('is invalid, not merely stale, when integrity failed', () => {
    expect(computeValidity([input('x', a)], [input('x', b)], { integrityFailures: ['reference hash does not match its receipt'] })).toEqual({
      state: 'invalid',
      reasons: ['reference hash does not match its receipt']
    });
  });
});
