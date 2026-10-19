import { describe, expect, it } from 'vitest';
import { comparisonOutcome, countComparisons, diffProjections, projectionSchema, type Projection } from '../src/index.js';

const sha = (character: string): string => character.repeat(64);

interface ItemSpec {
  id: string;
  subject?: string;
  kind?: 'component' | 'page';
  // The hash of the item's reference. Absent: the comparison recorded none.
  reference?: string;
  outcome?: 'passed' | 'failed' | 'not-run';
  enrolled?: boolean;
  noComparison?: boolean;
}

function projectionOf(items: ItemSpec[]): Projection {
  return projectionSchema.parse({
    schemaVersion: 1,
    project: { id: 'p', name: 'P' },
    provider: { name: 'test', readinessConcepts: { needsDesign: true, notEnrolled: true } },
    generatedAt: '2026-10-18T09:00:00.000Z',
    inventory: 'full',
    requirements: items.map((item) => ({
      id: item.id,
      label: item.id,
      subject: { kind: item.kind ?? 'component', id: item.subject ?? 'button' },
      requiredProofs: ['visual'],
      enrolled: item.enrolled ?? true
    })),
    comparisons: items
      .filter((item) => !item.noComparison)
      .map((item) => ({
        id: `${item.id}/react`,
        requirementId: item.id,
        subject: { kind: item.kind ?? 'component', id: item.subject ?? 'button', adapter: 'react' },
        ...(item.reference ? { reference: { artifact: { role: 'reference', path: `artifacts/${item.id}.png`, sha256: item.reference }, approval: { state: 'none' } } } : {}),
        proof: item.outcome === 'not-run' ? {} : { visual: item.outcome ?? 'passed' },
        verdict: { status: 'pass', severity: 'review' }
      }))
  });
}

const subjectChange = (diff: ReturnType<typeof diffProjections>, id: string) => diff.subjects.find((subject) => subject.id === id);

describe('comparison outcomes', () => {
  it('reads proof layers only', () => {
    expect(comparisonOutcome({ proof: { visual: 'passed', structural: 'failed' } })).toBe('failed');
    expect(comparisonOutcome({ proof: { visual: 'passed' } })).toBe('passed');
    expect(comparisonOutcome({ proof: {} })).toBe('not-run');
    expect(comparisonOutcome({ proof: { visual: 'unsupported' } })).toBe('not-run');
  });

  it('counts comparisons in their own unit', () => {
    expect(countComparisons([{ proof: { visual: 'passed' } }, { proof: { visual: 'failed' } }, { proof: {} }])).toEqual({ executed: 2, passed: 1, failed: 1, notRun: 1 });
  });
});

describe('diffProjections: the catalog', () => {
  it('finds nothing changed between identical releases', () => {
    const items: ItemSpec[] = [{ id: 'a', reference: sha('a') }, { id: 'b', reference: sha('b') }];

    const diff = diffProjections(projectionOf(items), projectionOf(items));

    expect(diff.totals).toEqual({ subjects: { added: 0, updated: 0, removed: 0, unchanged: 1 }, items: { added: 0, removed: 0, referenceChanged: 0 } });
    expect(subjectChange(diff, 'button')?.items.every((item) => item.change === 'unchanged')).toBe(true);
  });

  it('calls a reference updated when its hash changed, and keeps both versions for before and after', () => {
    const diff = diffProjections(projectionOf([{ id: 'a', reference: sha('a') }]), projectionOf([{ id: 'a', reference: sha('b') }]));

    expect(subjectChange(diff, 'button')?.change).toBe('updated');
    expect(subjectChange(diff, 'button')?.items[0]).toEqual({
      requirementId: 'a',
      label: 'a',
      change: 'reference-changed',
      before: { path: 'artifacts/a.png', sha256: sha('a') },
      after: { path: 'artifacts/a.png', sha256: sha('b') }
    });
    expect(diff.totals.items.referenceChanged).toBe(1);
  });

  it('does not call a reference updated just because its path or the implementation changed', () => {
    const before = projectionOf([{ id: 'a', reference: sha('a'), outcome: 'passed' }]);
    const after = projectionOf([{ id: 'a', reference: sha('a'), outcome: 'failed' }]);

    expect(subjectChange(diffProjections(before, after), 'button')?.change).toBe('unchanged');
  });

  it('claims nothing about a reference neither release hashed', () => {
    const diff = diffProjections(projectionOf([{ id: 'a' }]), projectionOf([{ id: 'a' }]));

    expect(subjectChange(diff, 'button')?.change).toBe('unchanged');
  });

  it('counts a reference that appeared or disappeared as changed', () => {
    expect(subjectChange(diffProjections(projectionOf([{ id: 'a' }]), projectionOf([{ id: 'a', reference: sha('a') }])), 'button')?.items[0]?.change).toBe('reference-changed');
    expect(subjectChange(diffProjections(projectionOf([{ id: 'a', reference: sha('a') }]), projectionOf([{ id: 'a' }])), 'button')?.items[0]?.change).toBe('reference-changed');
  });

  it('finds added and removed items inside a subject that exists in both', () => {
    const diff = diffProjections(projectionOf([{ id: 'a', reference: sha('a') }, { id: 'old', reference: sha('e') }]), projectionOf([{ id: 'a', reference: sha('a') }, { id: 'new', reference: sha('f') }]));

    const button = subjectChange(diff, 'button');
    expect(button?.change).toBe('updated');
    expect(button?.items.map((item) => [item.requirementId, item.change])).toEqual([['a', 'unchanged'], ['new', 'added'], ['old', 'removed']]);
    expect(button?.items.find((item) => item.change === 'added')).toMatchObject({ after: { sha256: sha('f') } });
    expect(button?.items.find((item) => item.change === 'removed')).toMatchObject({ before: { sha256: sha('e') } });
    expect(button?.counts).toEqual({ added: 1, removed: 1, referenceChanged: 0, unchanged: 1 });
  });

  it('finds whole subjects added and removed, by kind and id', () => {
    const previous = projectionOf([{ id: 'a', subject: 'button' }, { id: 'c', subject: 'checkout', kind: 'page' }]);
    const current = projectionOf([{ id: 'a', subject: 'button' }, { id: 'n', subject: 'select' }]);

    const diff = diffProjections(previous, current);

    expect(diff.subjects.map((subject) => [subject.id, subject.kind, subject.change])).toEqual([
      ['button', 'component', 'unchanged'],
      ['select', 'component', 'added'],
      ['checkout', 'page', 'removed']
    ]);
    expect(diff.totals.subjects).toEqual({ added: 1, updated: 0, removed: 1, unchanged: 1 });
  });

  it('keeps a component and a page of the same name apart', () => {
    const diff = diffProjections(projectionOf([{ id: 'a', subject: 'login', kind: 'page' }]), projectionOf([{ id: 'a', subject: 'login', kind: 'page' }, { id: 'b', subject: 'login', kind: 'component' }]));

    expect(diff.subjects.map((subject) => [subject.kind, subject.change])).toEqual([['component', 'added'], ['page', 'unchanged']]);
  });

  it('is deterministic whatever order the inputs list things in', () => {
    const one = diffProjections(projectionOf([{ id: 'a', reference: sha('a') }, { id: 'b', subject: 'select', reference: sha('b') }]), projectionOf([{ id: 'a', reference: sha('d') }]));
    const two = diffProjections(projectionOf([{ id: 'b', subject: 'select', reference: sha('b') }, { id: 'a', reference: sha('a') }]), projectionOf([{ id: 'a', reference: sha('d') }]));

    expect(one).toEqual(two);
  });
});

describe('diffProjections: verification', () => {
  it('finds regressed, fixed and still failing comparisons by id', () => {
    const previous = projectionOf([{ id: 'reg', outcome: 'passed' }, { id: 'fix', outcome: 'failed' }, { id: 'still', outcome: 'failed' }, { id: 'ok', outcome: 'passed' }]);
    const current = projectionOf([{ id: 'reg', outcome: 'failed' }, { id: 'fix', outcome: 'passed' }, { id: 'still', outcome: 'failed' }, { id: 'ok', outcome: 'passed' }]);

    expect(diffProjections(previous, current).verification).toEqual({ regressed: ['reg/react'], fixed: ['fix/react'], stillFailing: ['still/react'], newlyEnrolled: [] });
  });

  it('does not call a new failing comparison a regression, or a vanished one fixed', () => {
    const diff = diffProjections(projectionOf([{ id: 'gone', outcome: 'failed' }]), projectionOf([{ id: 'fresh', outcome: 'failed' }]));

    expect(diff.verification).toEqual({ regressed: [], fixed: [], stillFailing: [], newlyEnrolled: [] });
  });

  it('does not call a comparison that stopped running fixed', () => {
    const diff = diffProjections(projectionOf([{ id: 'a', outcome: 'failed' }]), projectionOf([{ id: 'a', outcome: 'not-run' }]));

    expect(diff.verification.fixed).toEqual([]);
  });

  it('finds items that became enrolled', () => {
    const diff = diffProjections(projectionOf([{ id: 'a', enrolled: false, noComparison: true }, { id: 'b', enrolled: false, noComparison: true }]), projectionOf([{ id: 'a', enrolled: true }, { id: 'b', enrolled: false, noComparison: true }]));

    expect(diff.verification.newlyEnrolled).toEqual(['a']);
  });
});
