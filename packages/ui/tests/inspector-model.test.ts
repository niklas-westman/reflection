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
  const model = buildInspectorModel({ projection, matrix: unusable.size > 0 ? buildMatrix({ projection, subject, unusableComparisonIds: unusable }) : matrix, filters, comparisonId: id, unusableComparisonIds: unusable, bundleHash: 'f'.repeat(64) });
  if (!model) throw new Error(`no model for ${id}`);
  return model;
}

describe('the inspector model', () => {
  it('has nothing for a comparison that does not exist', () => {
    expect(buildInspectorModel({ projection, matrix, filters: NO_FILTERS, comparisonId: 'nope', unusableComparisonIds: new Set(), bundleHash: 'f'.repeat(64) })).toBeUndefined();
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
    expect(modelOf('btn.primary/react').diffSummary).toEqual({ metric: 'diff-pixels', value: 120, ratio: 0.0015, threshold: [{ name: 'ratio', value: 0.001 }] });
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
    const model = buildInspectorModel({ projection: agent, matrix: buildMatrix({ projection: agent, subject: agentSubject!, unusableComparisonIds: new Set() }), filters: NO_FILTERS, comparisonId: 'btn.primary/react', unusableComparisonIds: new Set(), bundleHash: 'f'.repeat(64) });

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
