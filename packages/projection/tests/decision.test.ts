import { describe, expect, it } from 'vitest';
import { buildDecisionBinding, decisionSchema, evaluateDecision, verdictKey, type Comparison, type Decision, type Requirement } from '../src/index.js';

const hashA = 'a'.repeat(64);
const hashB = 'b'.repeat(64);
const policyA = 'c'.repeat(64);
const policyB = 'd'.repeat(64);

const requirements: Requirement[] = [
  { id: 'req-1', subject: { kind: 'component', id: 'button' }, requiredProofs: ['visual'], enrolled: true },
  { id: 'req-2', subject: { kind: 'component', id: 'button' }, requiredProofs: ['visual'], enrolled: true }
];

function comparison(id: string, overrides: Partial<Comparison> = {}): Comparison {
  return {
    id,
    requirementId: id === 'cmp-1' ? 'req-1' : 'req-2',
    subject: { kind: 'component', id: 'button' },
    proof: { visual: 'passed' },
    verdict: { status: 'pass', severity: 'review' },
    reference: { artifact: { role: 'reference', path: `refs/${id}.png`, sha256: hashA }, baselineSha256: hashA, approval: { state: 'none' } },
    capturePolicyHash: policyA,
    ...overrides
  };
}

const comparisons = [comparison('cmp-1'), comparison('cmp-2')];

function approval(overrides: Partial<Decision> = {}): Decision {
  return decisionSchema.parse({
    id: 'dec-1',
    kind: 'approve',
    bundleId: 'bundle-1',
    by: 'designer@example.com',
    at: '2026-10-18T10:00:00Z',
    attestation: 'human',
    binding: buildDecisionBinding(requirements, comparisons),
    ...overrides
  });
}

describe('decision schema', () => {
  it('requires a message when changes are required', () => {
    expect(() => approval({ kind: 'changes-required' })).toThrow('needs a message');
    expect(approval({ kind: 'changes-required', message: 'Hover padding needs another pass.' }).kind).toBe('changes-required');
  });

  it('requires a withdrawal to name its target and a decision to record its binding', () => {
    expect(() => approval({ kind: 'withdrawn' })).toThrow('must name the decision');
    expect(() => decisionSchema.parse({ id: 'd', kind: 'approve', bundleId: 'b', by: 'x@example.com', at: '2026-10-18T10:00:00Z', attestation: 'human' })).toThrow('what it is bound to');
  });

  it('allows an agent attestation only on a legacy reference approval, never on any other decision', () => {
    expect(approval({ kind: 'accept-reference', attestation: 'agent' }).attestation).toBe('agent');
    expect(() => approval({ kind: 'approve', attestation: 'agent' })).toThrow('only a legacy reference approval');
    expect(() => approval({ kind: 'changes-required', message: 'x', attestation: 'agent' })).toThrow('only a legacy reference approval');
  });

  it('accepts a decision a person gave in conversation when the agent that recorded it and the words are kept', () => {
    const delegated = { attestation: 'delegated', recordedBy: 'Claude', comment: 'Ship it, the Login page is right.' } as const;
    expect(approval(delegated).attestation).toBe('delegated');
    expect(() => approval({ ...delegated, recordedBy: undefined })).toThrow('name the agent');
    expect(() => approval({ ...delegated, comment: undefined })).toThrow("person's words in comment");
  });
});

describe('buildDecisionBinding', () => {
  it('records readable verdicts, reference hashes, capture policies and sorted requirement ids', () => {
    expect(buildDecisionBinding([...requirements].reverse(), comparisons)).toEqual({
      verdicts: { 'cmp-1': 'pass/review/-', 'cmp-2': 'pass/review/-' },
      references: { 'cmp-1': hashA, 'cmp-2': hashA },
      capturePolicies: { 'cmp-1': policyA, 'cmp-2': policyA },
      requirements: ['req-1', 'req-2']
    });
  });

  it('falls back to the reference image hash when the provider has no baseline file hash', () => {
    const withoutBaseline = comparison('cmp-1', { reference: { artifact: { role: 'reference', path: 'r.png', sha256: hashB }, approval: { state: 'none' } } });

    expect(buildDecisionBinding(requirements, [withoutBaseline]).references).toEqual({ 'cmp-1': hashB });
  });

  it('writes the failure class into the verdict', () => {
    expect(verdictKey({ status: 'warn', severity: 'review', failureClass: 'visual-diff' })).toBe('warn/review/visual-diff');
  });
});

describe('evaluateDecision', () => {
  const current = buildDecisionBinding(requirements, comparisons);

  it('holds on the same bundle when nothing changed', () => {
    expect(evaluateDecision(approval(), current, 'bundle-1')).toEqual({ state: 'holds' });
  });

  it('carries forward, and says from which build, when a rebuild has identical results', () => {
    expect(evaluateDecision(approval(), current, 'bundle-2')).toEqual({ state: 'carried-forward', from: 'bundle-1' });
  });

  it('lapses and names the check whose verdict changed', () => {
    const changed = buildDecisionBinding(requirements, [comparison('cmp-1', { verdict: { status: 'warn', severity: 'review', failureClass: 'visual-diff' } }), comparison('cmp-2')]);

    expect(evaluateDecision(approval(), changed, 'bundle-2')).toEqual({
      state: 'lapsed',
      causes: [{ kind: 'verdict', id: 'cmp-1', change: 'changed', from: 'pass/review/-', to: 'warn/review/visual-diff' }]
    });
  });

  it('lapses when a new baseline arrives even though every check still passes', () => {
    const newBaseline = comparison('cmp-2', { reference: { artifact: { role: 'reference', path: 'r.png', sha256: hashB }, baselineSha256: hashB, approval: { state: 'none' } } });
    const changed = buildDecisionBinding(requirements, [comparison('cmp-1'), newBaseline]);

    expect(evaluateDecision(approval(), changed, 'bundle-2')).toEqual({
      state: 'lapsed',
      causes: [{ kind: 'reference', id: 'cmp-2', change: 'changed', from: hashA, to: hashB }]
    });
  });

  it('lapses when the capture policy changes, or the required set grows or shrinks', () => {
    const policyChanged = buildDecisionBinding(requirements, [comparison('cmp-1', { capturePolicyHash: policyB }), comparison('cmp-2')]);
    const grown = buildDecisionBinding([...requirements, { id: 'req-3', subject: { kind: 'component', id: 'button' }, requiredProofs: ['visual'], enrolled: false }], comparisons);
    const shrunk = buildDecisionBinding([requirements[0] as Requirement], comparisons);

    expect(evaluateDecision(approval(), policyChanged, 'b2')).toMatchObject({ state: 'lapsed', causes: [{ kind: 'capture-policy', id: 'cmp-1', change: 'changed' }] });
    expect(evaluateDecision(approval(), grown, 'b2')).toMatchObject({ state: 'lapsed', causes: [{ kind: 'requirement', id: 'req-3', change: 'added' }] });
    expect(evaluateDecision(approval(), shrunk, 'b2')).toMatchObject({ state: 'lapsed', causes: [{ kind: 'requirement', id: 'req-2', change: 'removed' }] });
  });

  it('lapses when a bound check disappears or a new one appears', () => {
    const removed = buildDecisionBinding(requirements, [comparison('cmp-1')]);
    const added = buildDecisionBinding(requirements, [...comparisons, comparison('cmp-3')]);

    expect(evaluateDecision(approval(), removed, 'b2')).toMatchObject({ state: 'lapsed', causes: expect.arrayContaining([{ kind: 'verdict', id: 'cmp-2', change: 'removed', from: 'pass/review/-' }]) });
    expect(evaluateDecision(approval(), added, 'b2')).toMatchObject({ state: 'lapsed', causes: expect.arrayContaining([{ kind: 'verdict', id: 'cmp-3', change: 'added', to: 'pass/review/-' }]) });
  });

  it('reports a withdrawal as withdrawn', () => {
    const withdrawal = approval({ id: 'dec-2', kind: 'withdrawn', target: 'dec-1', binding: undefined });

    expect(evaluateDecision(withdrawal, current, 'bundle-1')).toEqual({ state: 'withdrawn' });
  });

  it('is unaffected by how many times the same evidence is read', () => {
    const decision = approval();

    expect(evaluateDecision(decision, current, 'bundle-3')).toEqual(evaluateDecision(decision, current, 'bundle-3'));
  });
});
