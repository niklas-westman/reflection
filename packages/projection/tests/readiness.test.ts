import { describe, expect, it } from 'vitest';
import { coverageSummarySchema, deriveReadiness, summarizeReadiness, type Comparison, type Requirement } from '../src/index.js';

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
