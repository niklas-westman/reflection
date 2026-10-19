import { describe, expect, it } from 'vitest';
import { collectArtifactRefs, type Projection } from 'reflection-projection';
import { prepareBundle } from '../src/model/bundle-state';
import { comparisonOutcome, countComparisons } from '../src/model/comparison-outcome';
import { availableDimensions, filterMatrix, NO_FILTERS } from '../src/model/filters';
import { buildMatrix } from '../src/model/matrix-model';
import { DEFAULT_SUBJECT_VIEW, parseSubjectSearch, toSubjectSearch } from '../src/model/search';
import { describeRuns, releaseStateLabel, runAgeAtBuild } from '../src/model/format';
import { hashRouteForPlainPath } from '../src/router';
import { buildFreshness } from '../src/model/freshness';
import { groupBySubject } from '../src/model/subject-model';
import { makeProjection } from './helpers/test-bundles';

function matrixFor(projection: Projection, unusable: ReadonlySet<string> = new Set()) {
  const [subject] = groupBySubject(projection);
  if (!subject) throw new Error('no subject');
  return buildMatrix({ projection, subject, unusableComparisonIds: unusable });
}

describe('comparison outcome', () => {
  it('reads proof layers only: a comparison with no layer that ran has not run', () => {
    const [failed, passed, notRun] = [
      { proof: { visual: 'passed', structural: 'failed' } },
      { proof: { visual: 'passed' } },
      { proof: { visual: 'passed', structural: 'not-run' } }
    ].map((partial) => comparisonOutcome(partial as never));

    expect([failed, passed, notRun]).toEqual(['failed', 'passed', 'not-run']);
    expect(comparisonOutcome({ proof: {} } as never)).toBe('not-run');
    expect(comparisonOutcome({ proof: { visual: 'unsupported' } } as never)).toBe('not-run');
  });

  it('counts comparisons in their own unit', () => {
    expect(countComparisons(makeProjection().comparisons)).toEqual({ executed: 5, passed: 4, failed: 1, notRun: 1 });
  });
});

describe('the matrix', () => {
  it('puts each item in the one group its readiness says, failures first', () => {
    const matrix = matrixFor(makeProjection());

    expect(matrix.groups.map((group) => [group.id, group.rows.map((row) => row.label)])).toEqual([
      ['failed', ['hero.phone']],
      ['not-proven', ['faq.desktop', 'banner.desktop']],
      ['passed', ['hero.desktop']],
      ['missing', ['promo.desktop', 'footer.desktop']]
    ]);
  });

  it('counts the reasons things are missing, with the provider detail kept on the row', () => {
    const missing = matrixFor(makeProjection()).groups.find((group) => group.id === 'missing');

    expect(missing?.reasons).toEqual([
      { reason: 'No design selected', count: 1 },
      { reason: 'Not enrolled', count: 1 }
    ]);
    expect(missing?.rows[0]?.detail).toBe('No design has been selected for the promo banner');
  });

  it('has one column per implementation and a cell that knows its worst outcome', () => {
    const matrix = matrixFor(makeProjection());
    const faq = matrix.groups.flatMap((group) => group.rows).find((row) => row.label === 'faq.desktop');

    expect(matrix.columns.map((column) => column.label)).toEqual(['chrome', 'firefox']);
    expect(faq?.cells.get('chrome')?.outcome).toBe('passed');
    expect(faq?.cells.get('firefox')?.outcome).toBe('not-run');
    expect(matrix.groups.flatMap((group) => group.rows).find((row) => row.label === 'banner.desktop')?.cells.get('chrome')?.outcome).toBe('none');
  });

  it('opens the failed comparison from a cell that holds several', () => {
    const projection = makeProjection();
    projection.comparisons.push({ ...projection.comparisons[0]!, id: 'hero.desktop/chrome/second', proof: { visual: 'failed' } });

    const cell = matrixFor(projection).groups.flatMap((group) => group.rows).find((row) => row.label === 'hero.desktop')?.cells.get('chrome');

    expect(cell?.comparisons).toHaveLength(2);
    expect(cell?.primary?.id).toBe('hero.desktop/chrome/second');
  });

  it('describes the reference by availability and source, never by a verdict', () => {
    const rows = matrixFor(makeProjection()).groups.flatMap((group) => group.rows);

    expect(rows.find((row) => row.label === 'hero.desktop')?.reference).toEqual({ availability: 'available', source: 'Reference screenshots', approval: 'holds', attestation: 'human' });
    expect(rows.find((row) => row.label === 'promo.desktop')?.reference.availability).toBe('missing');
    expect(Object.keys(rows[0]!.reference)).not.toContain('verdict');
  });

  it('uses one "Result" column when the provider has no implementations', () => {
    const projection = makeProjection();
    projection.comparisons = projection.comparisons.map((entry) => ({ ...entry, subject: { kind: entry.subject.kind, id: entry.subject.id } }));

    expect(matrixFor(projection).columns).toEqual([{ id: '', label: 'Result' }]);
  });
});

describe('subjects and counts', () => {
  it('groups by subject and counts with the one shared function', () => {
    const [subject] = groupBySubject(makeProjection());

    expect(subject?.summary).toEqual({ required: 6, proven: 1, failing: 1, needsDesign: 1, notEnrolled: 1, unknown: 2 });
  });

  it('keeps a bucket the provider has no concept of unknown, not zero', () => {
    const projection = makeProjection({ provider: { name: 'p', readinessConcepts: { needsDesign: false, notEnrolled: false }, capabilities: [] } });

    const [subject] = groupBySubject(projection);

    expect(subject?.summary.needsDesign).toBeNull();
    expect(subject?.summary.notEnrolled).toBeNull();
  });
});

describe('filters', () => {
  const matrix = matrixFor(makeProjection());
  const labels = (filters: Partial<typeof NO_FILTERS>) =>
    filterMatrix(matrix, { ...NO_FILTERS, ...filters }).groups.flatMap((group) => group.rows.map((row) => row.label));

  it('searches label, id and dimension values', () => {
    expect(labels({ search: 'PHONE' })).toEqual(['hero.phone']);
    expect(labels({ search: 'faq' })).toEqual(['faq.desktop']);
  });

  it('filters by outcome and by dimension, and both must hold', () => {
    expect(labels({ outcomes: ['failed', 'passed'] })).toEqual(['hero.phone', 'hero.desktop']);
    expect(labels({ dimensions: { viewport: ['phone'] } })).toEqual(['hero.phone']);
    expect(labels({ outcomes: ['passed'], dimensions: { viewport: ['phone'] } })).toEqual([]);
  });

  it('lists only dimensions that offer a choice', () => {
    expect(availableDimensions(matrix)).toEqual([
      { name: 'state', values: ['banner', 'faq', 'footer', 'hero', 'promo'] },
      { name: 'viewport', values: ['desktop', 'phone'] }
    ]);
  });

  it('recounts the missing reasons after filtering', () => {
    const missing = filterMatrix(matrix, { ...NO_FILTERS, search: 'promo' }).groups.find((group) => group.id === 'missing');

    expect(missing?.reasons).toEqual([{ reason: 'No design selected', count: 1 }]);
  });
});

describe('the address of a view', () => {
  it('round-trips and omits defaults', () => {
    const view = {
      mode: 'items' as const,
      item: 'hero.phone',
      adapters: ['chrome'],
      filters: { search: 'hero', outcomes: ['failed' as const], dimensions: { viewport: ['phone'] } },
      density: 'compact' as const
    };

    expect(toSubjectSearch(view)).toEqual({ view: 'items', item: 'hero.phone', adapters: 'chrome', q: 'hero', outcome: 'failed', dims: { viewport: ['phone'] }, density: 'compact' });
    expect(parseSubjectSearch(toSubjectSearch(view))).toEqual(view);
    expect(toSubjectSearch(DEFAULT_SUBJECT_VIEW)).toEqual({});
  });

  it('falls back to defaults for a hand-edited link', () => {
    expect(parseSubjectSearch({ density: 'huge', view: 'sideways', outcome: 'failed,bogus', dims: 'x', q: 7, item: '', adapters: '' })).toEqual({
      ...DEFAULT_SUBJECT_VIEW,
      filters: { search: '', outcomes: ['failed'], dimensions: {} }
    });
  });
});

describe('preparing a bundle', () => {
  const opened = (projection: Projection, unusablePaths: string[]) =>
    ({ manifest: {} as never, projection: { ...projection, release: undefined }, unusablePaths: new Set(unusablePaths) }) as never;

  it('reads a sound bundle as offline, never current', () => {
    expect(prepareBundle(opened(makeProjection(), []), []).validity).toEqual({ state: 'offline' });
  });

  it('reads a bundle with no runs as never run', () => {
    expect(prepareBundle(opened(makeProjection({ runs: [] }), []), []).validity).toEqual({ state: 'never-run' });
  });

  it('turns a comparison with an unusable file into unknown everywhere, not into a passed or failed one', () => {
    const projection = makeProjection();
    const unusablePath = collectArtifactRefs(projection).find((artifact) => artifact.path.includes('hero.phone-chrome'))?.path ?? '';
    const problems = [{ code: 'file-hash-mismatch' as const, path: unusablePath, message: 'the file does not match the hash in the manifest' }];

    const prepared = prepareBundle(opened(projection, [unusablePath]), problems);

    expect(prepared.validity.state).toBe('invalid');
    expect([...prepared.unusableComparisonIds]).toEqual(['hero.phone/chrome']);
    // hero.phone was the one failure; its evidence cannot be trusted, so nothing fails and the item is not proven.
    expect(prepared.summary).toMatchObject({ failing: 0, proven: 1, unknown: 3 });
  });
});

describe('formatting dates', () => {
  it('reads the same everywhere, in UTC, with fixed month names', async () => {
    const { formatDate } = await import('../src/model/format');

    expect(formatDate('2026-09-20T23:30:00.000Z')).toBe('20 Sep 2026');
    expect(formatDate('2026-01-01T00:00:00.000Z')).toBe('1 Jan 2026');
    expect(formatDate('2026-12-31T23:59:59.000Z')).toBe('31 Dec 2026');
  });
});

describe('release and run wording', () => {
  it('names the release state without claiming a stage the provider never claimed', () => {
    expect(releaseStateLabel('candidate')).toBe('Unreleased');
    expect(releaseStateLabel('released')).toBe('Released');
  });

  it('says how much older the run is than the build, only from a whole day', () => {
    expect(runAgeAtBuild('2026-10-14T08:00:00Z', '2026-10-19T09:00:00Z')).toBe('5 days before this build');
    expect(runAgeAtBuild('2026-10-18T08:00:00Z', '2026-10-19T09:00:00Z')).toBe('1 day before this build');
    expect(runAgeAtBuild('2026-10-19T01:00:00Z', '2026-10-19T09:00:00Z')).toBeUndefined();
    expect(runAgeAtBuild('2026-10-20T01:00:00Z', '2026-10-19T09:00:00Z')).toBeUndefined();
    expect(describeRuns([{ finishedAt: '2026-10-16T00:00:00Z' }, { finishedAt: '2026-10-14T00:00:00Z' }], '2026-10-19T00:00:00Z')).toBe('2 runs, the oldest 5 days before this build');
  });
});

describe('a plain path pasted without the hash', () => {
  it('becomes the same hash route, and the root or a hash route is left alone', () => {
    expect(hashRouteForPlainPath('/bundles/login-1', '', '/')).toBe('/#/bundles/login-1');
    expect(hashRouteForPlainPath('/viewer/bundles/login-1/pages/login', '', '/viewer/')).toBe('/viewer/#/bundles/login-1/pages/login');
    expect(hashRouteForPlainPath('/', '', '/')).toBeUndefined();
    expect(hashRouteForPlainPath('/index.html', '', '/')).toBeUndefined();
    expect(hashRouteForPlainPath('/bundles/login-1', '#/bundles/x', '/')).toBeUndefined();
  });
});

describe('freshness', () => {
  const snapshot = { id: 's', kind: 'penpot', role: 'proof-source', label: 'Login frames', capturedAt: '2026-10-13T08:00:00Z' };
  const run = { id: 'r', finishedAt: '2026-10-14T08:00:00Z', engine: { name: 'pixelmatch', version: '7.2.0' }, nativeValidity: 'current' };

  it('reads as design date, run and its age, what was not verified, and the tool\'s own word marked untrusted', () => {
    expect(buildFreshness({ snapshots: [snapshot], runs: [run], builtAt: '2026-10-19T09:00:00Z', validity: { state: 'offline' } })).toEqual([
      { label: 'Design', value: 'Login frames, captured 13 Oct 2026' },
      { label: 'Run', value: '14 Oct 2026 · pixelmatch 7.2.0 · 5 days before this build' },
      { label: 'Not verified', value: 'Whether the design or code changed after the run: this bundle is offline' },
      { label: "Tool's own check", value: 'current (not trusted)' }
    ]);
  });

  it('warns when the inputs changed, the evidence is unusable or nothing ran', () => {
    const stale = buildFreshness({ snapshots: [], runs: [], builtAt: '2026-10-19T09:00:00Z', validity: { state: 'stale', causes: [{ role: 'app-code', key: 'app:src', change: 'changed' }] } });
    expect(stale).toEqual([{ label: 'Changed since the run', value: 'app:src (changed)', caution: true }]);
    expect(buildFreshness({ snapshots: [], runs: [], builtAt: '2026-10-19T09:00:00Z', validity: { state: 'never-run' } })[0]).toMatchObject({ label: 'Not run', caution: true });
    expect(buildFreshness({ snapshots: [], runs: [], builtAt: '2026-10-19T09:00:00Z', validity: { state: 'invalid', reasons: ['a.png does not match'] } })[0]).toMatchObject({ label: 'Unusable evidence', caution: true });
  });
});
