import { describe, expect, it } from 'vitest';
import { coverageSummarySchema, deriveReadiness, missingImplementations, requirementSchema, summarizeReadiness, type Comparison, type Requirement } from '../src/index.js';

const both = { needsDesign: true, notEnrolled: true };

function requirement(overrides: Partial<Requirement> = {}): Requirement {
  return { id: 'req', subject: { kind: 'component', id: 'button' }, requiredProofs: ['visual'], enrolled: true, ...overrides };
}

function comparison(overrides: Partial<Comparison> = {}): Comparison {
  return {
    id: 'cmp',
    requirementId: 'req',
    subject: { kind: 'component', id: 'button' },
    proof: { visual: 'passed' },
    verdict: { status: 'pass', severity: 'review' },
    ...overrides
  };
}

describe('deriveReadiness', () => {
  it('is proven when every required layer passed in every comparison', () => {
    const req = requirement({ requiredProofs: ['structural', 'visual'] });
    const comparisons = [comparison({ id: 'a', proof: { structural: 'passed', visual: 'passed' } }), comparison({ id: 'b', proof: { structural: 'passed', visual: 'passed' } })];

    expect(deriveReadiness(req, comparisons, both)).toBe('proven');
  });

  it('is failing when any required layer failed, even if others passed', () => {
    const comparisons = [comparison({ id: 'a' }), comparison({ id: 'b', proof: { visual: 'failed' } })];

    expect(deriveReadiness(requirement(), comparisons, both)).toBe('failing');
  });

  it('never counts an unsupported or not-run required layer as a pass', () => {
    const req = requirement({ requiredProofs: ['visual', 'behavior'] });

    expect(deriveReadiness(req, [comparison({ proof: { visual: 'passed', behavior: 'unsupported' } })], both)).toBe('unknown');
    expect(deriveReadiness(req, [comparison({ proof: { visual: 'passed', behavior: 'not-run' } })], both)).toBe('unknown');
  });

  it('keeps a layer that is not required out of the decision', () => {
    const comparisons = [comparison({ proof: { visual: 'passed', behavior: 'failed' } })];

    expect(deriveReadiness(requirement({ requiredProofs: ['visual'] }), comparisons, both)).toBe('proven');
  });

  it('is needs-design when no design exists, and not-enrolled when no comparison is set up', () => {
    expect(deriveReadiness(requirement({ enrolled: false, design: { availability: 'missing' } }), [], both)).toBe('needs-design');
    expect(deriveReadiness(requirement({ enrolled: false }), [], both)).toBe('not-enrolled');
    expect(deriveReadiness(requirement({ design: { availability: 'unmapped' } }), [], both)).toBe('not-enrolled');
  });

  it('reports unknown, not zero or a guess, when the provider has no such concept', () => {
    const none = { needsDesign: false, notEnrolled: false };

    expect(deriveReadiness(requirement({ enrolled: false, design: { availability: 'missing' } }), [], none)).toBe('unknown');
    expect(deriveReadiness(requirement({ enrolled: false }), [], none)).toBe('unknown');
  });

  it('is unknown for an enrolled requirement that has no comparison yet', () => {
    expect(deriveReadiness(requirement(), [], both)).toBe('unknown');
  });

  it('ignores comparisons that belong to another requirement', () => {
    expect(deriveReadiness(requirement(), [comparison({ requirementId: 'other' })], both)).toBe('unknown');
  });
});

describe('summarizeReadiness', () => {
  it('counts every requirement in exactly one bucket and the buckets add up to required', () => {
    const requirements = [
      requirement({ id: 'a' }),
      requirement({ id: 'b' }),
      requirement({ id: 'c', enrolled: false }),
      requirement({ id: 'd', enrolled: false, design: { availability: 'missing' } }),
      requirement({ id: 'e' })
    ];
    const comparisons = [comparison({ id: '1', requirementId: 'a' }), comparison({ id: '2', requirementId: 'b', proof: { visual: 'failed' } })];

    expect(summarizeReadiness(requirements, comparisons, both)).toEqual({ required: 5, proven: 1, failing: 1, needsDesign: 1, notEnrolled: 1, unknown: 1 });
  });

  it('reports a bucket the provider lacks as null and counts those requirements as unknown', () => {
    const requirements = [requirement({ id: 'a', enrolled: false })];

    expect(summarizeReadiness(requirements, [], { needsDesign: false, notEnrolled: false })).toEqual({
      required: 1,
      proven: 0,
      failing: 0,
      needsDesign: null,
      notEnrolled: null,
      unknown: 1
    });
  });
});

describe('coverageSummarySchema', () => {
  it('rejects a summary whose buckets do not add up to required', () => {
    expect(() => coverageSummarySchema.parse({ required: 10, proven: 4, failing: 1, needsDesign: 1, notEnrolled: 1, unknown: 1 })).toThrow('sum of the readiness buckets');
  });

  it('accepts null buckets as zero in the sum', () => {
    expect(coverageSummarySchema.parse({ required: 3, proven: 3, failing: 0, needsDesign: null, notEnrolled: null, unknown: 0 }).required).toBe(3);
  });
});

describe('required implementations', () => {
  const adapterComparison = (adapter: string, outcome: 'passed' | 'failed' = 'passed'): Comparison =>
    comparison({ id: `cmp-${adapter}`, subject: { kind: 'component', id: 'button', adapter }, proof: { visual: outcome } });
  const required = requirement({ requiredImplementations: ['react', 'vue', 'svelte'] });

  it('is proven when every required implementation was compared and passed', () => {
    expect(deriveReadiness(required, ['react', 'vue', 'svelte'].map((adapter) => adapterComparison(adapter)), both)).toBe('proven');
  });

  it('is not proven when a required implementation was never compared, even if the others passed', () => {
    expect(deriveReadiness(required, [adapterComparison('react'), adapterComparison('vue')], both)).toBe('unknown');
  });

  it('is still failing when one implementation failed and another is missing', () => {
    expect(deriveReadiness(required, [adapterComparison('react', 'failed'), adapterComparison('vue')], both)).toBe('failing');
  });

  it('does not let a comparison without an adapter stand in for a named implementation', () => {
    expect(deriveReadiness(requirement({ requiredImplementations: ['react'] }), [comparison()], both)).toBe('unknown');
  });

  it('ignores implementations that are compared but not required', () => {
    const onlyReact = requirement({ requiredImplementations: ['react'] });

    expect(deriveReadiness(onlyReact, [adapterComparison('react'), adapterComparison('vue')], both)).toBe('proven');
  });

  it('keeps today\'s rule when none are declared: only recorded comparisons count', () => {
    expect(deriveReadiness(requirement(), [adapterComparison('react')], both)).toBe('proven');
  });

  it('lists the missing required implementations, and none when none are declared', () => {
    expect(missingImplementations(required, [adapterComparison('react')])).toEqual(['vue', 'svelte']);
    expect(missingImplementations(requirement(), [])).toEqual([]);
    expect(missingImplementations(required, [adapterComparison('react'), adapterComparison('vue'), adapterComparison('svelte')])).toEqual([]);
  });

  it('counts such an item as not proven in the summary, with the buckets still adding up', () => {
    const summary = summarizeReadiness([required], [adapterComparison('react')], both);

    expect(summary).toMatchObject({ required: 1, proven: 0, failing: 0, unknown: 1 });
    expect(coverageSummarySchema.safeParse(summary).success).toBe(true);
  });

  it('is part of the requirement schema, and an empty list is refused', () => {
    const base = { id: 'r', subject: { kind: 'component', id: 'button' }, requiredProofs: ['visual'], enrolled: true };

    expect(requirementSchema.safeParse({ ...base, requiredImplementations: ['react'] }).success).toBe(true);
    expect(requirementSchema.safeParse({ ...base, requiredImplementations: [] }).success).toBe(false);
    expect(requirementSchema.safeParse({ ...base, requiredImplementations: [''] }).success).toBe(false);
  });
});
