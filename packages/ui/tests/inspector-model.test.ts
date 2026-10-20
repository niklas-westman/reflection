import { describe, expect, it } from 'vitest';
import { NO_FILTERS } from '../src/model/filters';
import { buildInspectorModel, describeSample, type InspectorModel } from '../src/model/inspector-model';
import { buildMatrix } from '../src/model/matrix-model';
import { groupBySubject, type SubjectGroup } from '../src/model/subject-model';
import { makeInspectorProjection } from './helpers/test-bundles';

const projection = makeInspectorProjection();
const subject = groupBySubject(projection)[0] as SubjectGroup;
const matrix = buildMatrix({ projection, subject, unusableComparisonIds: new Set() });

function modelOf(id: string, filters = NO_FILTERS, unusable: ReadonlySet<string> = new Set()): InspectorModel {
  const model = buildInspectorModel({ projection, matrix: unusable.size > 0 ? buildMatrix({ projection, subject, unusableComparisonIds: unusable }) : matrix, filters, comparisonId: id, unusableComparisonIds: unusable, bundleHash: 'f'.repeat(64), builtAt: '2026-10-18T10:00:00.000Z', validity: { state: 'offline' } });
  if (!model) throw new Error(`no model for ${id}`);
  return model;
}

describe('the inspector model', () => {
  it('has nothing for a comparison that does not exist', () => {
    expect(buildInspectorModel({ projection, matrix, filters: NO_FILTERS, comparisonId: 'nope', unusableComparisonIds: new Set(), bundleHash: 'f'.repeat(64), builtAt: '2026-10-18T10:00:00.000Z', validity: { state: 'offline' } })).toBeUndefined();
  });

  it('labels the comparison by its item and implementation and reads its outcome from the proof layers', () => {
    const model = modelOf('btn.primary/react');

    expect(model.label).toBe('primary default · react');
    expect(model.outcome).toBe('failed');
    expect(model.verdict).toBe('fail / blocking / measurement');
  });

  it('puts failing measurements first, with one plain sentence from the recorded values only', () => {
    const { measurements } = modelOf('btn.primary/react');

    expect(measurements?.failing.map((sample) => `${sample.part}.${sample.property}`)).toEqual(['label.padding-x', 'root.radius']);
    expect(measurements?.passing.map((sample) => `${sample.part}.${sample.property}`)).toEqual(['label.font-size', 'root.height']);
    expect(measurements?.sentence).toBe('label padding-x: the design says 16px, the implementation has 14px (-2px).');
    expect(describeSample({ part: 'a', property: 'b', expected: '1', actual: '2', delta: undefined, tolerance: undefined, passed: false })).toBe('a b: the design says 1, the implementation has 2.');
  });

  it('has no measurements when none were recorded, instead of an empty list', () => {
    expect(modelOf('btn.primary/vue').measurements).toBeUndefined();
  });

  it('summarizes the recorded diff and threshold, and has none when none was recorded', () => {
    expect(modelOf('btn.primary/react').diffSummary).toEqual({ metric: 'diff-pixels', label: 'diff-pixels', valueText: '120', meaning: undefined, value: 120, ratio: 0.0015, threshold: [{ name: 'ratio', value: 0.001 }] });
    expect(modelOf('btn.primary/vue').diffSummary).toBeUndefined();
  });

  it('lists the provenance that was recorded: run, environment, source, hashes, nodes and the bundle', () => {
    const labels = modelOf('btn.primary/react').provenance.map((fact) => fact.label);

    expect(labels).toEqual(expect.arrayContaining(['Run', 'browser', 'platform', 'Design source', 'Source file', 'Approved baseline', 'Capture policy', 'Design source nodes', 'Bundle']));
    expect(modelOf('btn.primary/react').provenance.find((fact) => fact.label === 'Bundle')?.value).toBe('f'.repeat(64));
    expect(modelOf('btn.primary/vue').provenance.map((fact) => fact.label)).not.toContain('Capture policy');
  });

  it('says what was not proven', () => {
    expect(modelOf('btn.primary/vue').gaps).toEqual(['No difference image or pixel metric was recorded.', 'Detailed measurements were not recorded.']);
    expect(modelOf('btn.ghost/react').gaps).toEqual(
      expect.arrayContaining(['The structural proof was not recorded.', 'The visual proof did not run.', 'No reference image was recorded.', 'No difference image or pixel metric was recorded.', 'Detailed measurements were not recorded.'])
    );
  });

  it('says where an item was not compared', () => {
    expect(modelOf('btn.secondary/react').gaps).toContain('This item was not compared in: vue.');
  });

  it('flags a reference approval nobody confirmed, as a caution and a gap', () => {
    const agent = structuredClone(projection);
    const first = agent.comparisons[0];
    if (first?.reference) first.reference.approval = { state: 'holds', attestation: 'agent', by: 'script', at: '2026-10-14T09:00:00.000Z' };
    const [agentSubject] = groupBySubject(agent);
    const model = buildInspectorModel({ projection: agent, matrix: buildMatrix({ projection: agent, subject: agentSubject!, unusableComparisonIds: new Set() }), filters: NO_FILTERS, comparisonId: 'btn.primary/react', unusableComparisonIds: new Set(), bundleHash: 'f'.repeat(64), builtAt: '2026-10-18T10:00:00.000Z', validity: { state: 'offline' } });

    expect(model?.caution).toContain('recorded by an agent');
    expect(model?.gaps).toContain('The reference approval is not confirmed by a person.');
    expect(modelOf('btn.primary/react').caution).toBeUndefined();
  });

  it('marks unusable evidence as a gap', () => {
    expect(modelOf('btn.primary/react', NO_FILTERS, new Set(['btn.primary/react'])).gaps[0]).toBe('A file behind this comparison is unusable, so its result is unknown.');
  });

  it('carries recorded limitations', () => {
    expect(modelOf('btn.primary/react').limitations).toEqual(['Hover styles are not captured']);
  });

  it('links the same item in other implementations', () => {
    expect(modelOf('btn.primary/react').siblings).toEqual([{ id: 'btn.primary/vue', label: 'vue', outcome: 'passed' }]);
    expect(modelOf('btn.secondary/react').siblings).toEqual([]);
  });
});

function modelFor(changed: typeof projection, id: string): InspectorModel {
  const [changedSubject] = groupBySubject(changed);
  const model = buildInspectorModel({ projection: changed, matrix: buildMatrix({ projection: changed, subject: changedSubject!, unusableComparisonIds: new Set() }), filters: NO_FILTERS, comparisonId: id, unusableComparisonIds: new Set(), bundleHash: 'f'.repeat(64), builtAt: '2026-10-18T10:00:00.000Z', validity: { state: 'offline' } });
  if (!model) throw new Error(`no model for ${id}`);
  return model;
}

describe('what the inspector shows of a provider\'s own record', () => {
  it('says what a metric means when the provider gave its label, unit, direction and passing line', () => {
    const described = structuredClone(projection);
    described.comparisons[0]!.diff!.metric = { name: 'pixelmatch-match-percent', value: 99.75, label: 'Match', unit: '%', direction: 'higher-is-better', passAt: 95 };
    expect(modelFor(described, 'btn.primary/react').diffSummary).toMatchObject({ label: 'Match', valueText: '99.75 %', meaning: 'Passes at 95 % or more' });

    described.comparisons[0]!.diff!.metric = { name: 'diff-pixels', value: 120, direction: 'lower-is-better' };
    expect(modelFor(described, 'btn.primary/react').diffSummary).toMatchObject({ label: 'diff-pixels', valueText: '120', meaning: 'Lower is better' });
  });

  it('shows who approved the reference, who wrote it down, when, the words, and whether it is bound to the design source read', () => {
    const delegated = structuredClone(projection);
    const bound = 'c'.repeat(64);
    delegated.snapshots[0]!.sha256 = bound;
    const first = delegated.comparisons[0]!;
    first.reference!.approval = { state: 'holds', attestation: 'delegated', by: 'Owner', recordedBy: 'Assistant', at: '2026-10-13T20:56:08.000Z', boundTo: bound, note: 'These are the approved Login frames.' };
    const model = modelFor(delegated, 'btn.primary/react');

    expect(model.caution).toBeUndefined();
    expect(model.gaps).not.toContain('The reference approval is not confirmed by a person.');
    expect(model.approvalFacts).toEqual([
      { label: 'Approval', value: 'Approved by a person, written down by an agent' },
      { label: 'Approved by', value: 'Owner' },
      { label: 'Recorded by', value: 'Assistant' },
      { label: 'Approved on', value: '13 Oct 2026' },
      { label: 'Bound to', value: bound, mono: true },
      { label: 'Design source', value: 'Same content as the design source this comparison read' },
      { label: 'Note', value: 'These are the approved Login frames.', long: true }
    ]);

    first.reference!.approval = { state: 'holds', attestation: 'agent', by: 'Assistant', boundTo: 'd'.repeat(64) };
    const agent = modelFor(delegated, 'btn.primary/react');
    expect(agent.caution).toContain('recorded by an agent');
    expect(agent.approvalFacts).toContainEqual({ label: 'Approval', value: "Recorded by an agent, no person's words" });
    expect(agent.approvalFacts).toContainEqual({ label: 'Design source', value: 'Differs from the design source this comparison read, whose hash is:' });
    expect(agent.approvalFacts).toContainEqual({ label: 'Source read', value: bound, mono: true });
  });

  it('says a lapsed approval no longer matches, and who had recorded it', () => {
    const lapsed = structuredClone(projection);
    lapsed.comparisons[0]!.reference!.approval = { state: 'lapsed', attestation: 'human', by: 'Owner', causes: ['the reference manifest changed'] };
    const facts = modelFor(lapsed, 'btn.primary/react').approvalFacts;

    expect(facts.slice(0, 2)).toEqual([
      { label: 'Approval', value: 'No longer matches the current reference' },
      { label: 'It was', value: 'Approved and recorded by a person' }
    ]);
    expect(facts).toContainEqual({ label: 'Changed since', value: 'the reference manifest changed' });
  });

  it('has no approval facts for a reference nobody approved', () => {
    const none = structuredClone(projection);
    none.comparisons[0]!.reference!.approval = { state: 'none' };
    expect(modelFor(none, 'btn.primary/react').approvalFacts).toEqual([]);
  });

  it('carries the tool\'s own outcome and validity, labelled as native', () => {
    const native = structuredClone(projection);
    native.comparisons[0]!.nativeOutcome = 'passed';
    native.runs[0]!.nativeValidity = 'current';
    const model = modelFor(native, 'btn.primary/react');

    expect(model.nativeOutcome).toBe('passed');
    expect(model.freshness).toContainEqual({ label: "Tool's own check", value: 'current (not trusted)' });
    expect(modelOf('btn.primary/react').nativeOutcome).toBeUndefined();
  });

  it('does not list what a pixel-only provider without implementations never records', () => {
    const pixelOnly = structuredClone(projection);
    for (const comparison of pixelOnly.comparisons) {
      delete comparison.measurements;
      delete comparison.subject.adapter;
    }
    pixelOnly.comparisons = pixelOnly.comparisons.filter((comparison, index, all) => all.findIndex((other) => other.requirementId === comparison.requirementId) === index);
    const model = modelFor(pixelOnly, 'btn.primary/react');

    expect(model.gaps).not.toContain('Detailed measurements were not recorded.');
    expect(model.bundleRecordsMeasurements).toBe(false);
    expect(model.implementationsRecorded).toBe(false);
    expect(modelOf('btn.primary/react').implementationsRecorded).toBe(true);
  });
});

describe('moving between comparisons', () => {
  it('walks the subject in the order its matrix shows, failures first', () => {
    const { sequence } = modelOf('btn.primary/react');

    expect(sequence.ids[0]).toBe('btn.primary/react');
    expect(sequence).toMatchObject({ index: 0, previous: undefined, filtered: true });
    expect(sequence.next).toBe(sequence.ids[1]);
  });

  it('ends at the last comparison', () => {
    const last = modelOf('btn.primary/react').sequence.ids.at(-1) ?? '';

    expect(modelOf(last).sequence.next).toBeUndefined();
  });

  it('follows only what the filtered page showed', () => {
    const { sequence } = modelOf('btn.primary/react', { ...NO_FILTERS, outcomes: ['failed'] });

    expect(sequence.ids).toEqual(['btn.primary/react']);
    expect(sequence).toMatchObject({ previous: undefined, next: undefined, filtered: true });
  });

  it('falls back to the whole subject when the filters exclude the comparison being viewed', () => {
    const { sequence } = modelOf('btn.secondary/react', { ...NO_FILTERS, outcomes: ['failed'] });

    expect(sequence.filtered).toBe(false);
    expect(sequence.ids).toContain('btn.secondary/react');
  });
});
