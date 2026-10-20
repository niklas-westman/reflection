import { describe, expect, it } from 'vitest';
import { buildItemDetail, currentRow, dimensionChoices, orderedRows, pageChecks, pickRow, selectedColumns } from '../src/model/gallery-model';
import { buildMatrix } from '../src/model/matrix-model';
import { groupBySubject } from '../src/model/subject-model';
import { makeComponentProjection, makeProjection } from './helpers/test-bundles';
import type { Projection } from 'reflection-projection';

function matrixOf(projection: Projection, unusable: ReadonlySet<string> = new Set()) {
  const [subject] = groupBySubject(projection);
  if (!subject) throw new Error('no subject');
  return buildMatrix({ projection, subject, unusableComparisonIds: unusable });
}

const projection = makeComponentProjection();
const matrix = matrixOf(projection);
const rows = orderedRows(matrix);
const labels = (list: typeof rows) => list.map((row) => row.label);

describe('choosing an item', () => {
  it('orders items so the one that most needs attention comes first', () => {
    expect(labels(rows)).toEqual(['primary hover light', 'secondary hover light', 'primary default light', 'secondary default light', 'primary default dark']);
  });

  it('opens the item a link names, else the first', () => {
    expect(currentRow(rows, 'button.secondary.default.light')?.label).toBe('secondary default light');
    expect(currentRow(rows, 'nothing')?.label).toBe('primary hover light');
    expect(currentRow(rows, undefined)?.label).toBe('primary hover light');
    expect(currentRow([], undefined)).toBeUndefined();
  });

  it('offers only the dimensions that have a choice', () => {
    expect(dimensionChoices(rows)).toEqual([
      { name: 'variant', values: ['primary', 'secondary'] },
      { name: 'mode', values: ['dark', 'light'] },
      { name: 'state', values: ['default', 'hover'] }
    ]);
  });

  it('keeps the dimension just changed, and as many others as an existing item allows', () => {
    const hoverPrimary = rows.find((row) => row.label === 'primary hover light');
    if (!hoverPrimary) throw new Error('missing fixture');

    expect(pickRow(rows, { ...hoverPrimary.dimensions, variant: 'secondary' }, 'variant')?.label).toBe('secondary hover light');
    // There is no dark hover item, so changing mode lands on the nearest dark item.
    expect(pickRow(rows, { ...hoverPrimary.dimensions, mode: 'dark' }, 'mode')?.label).toBe('primary default dark');
  });

  it('offers "no value" for an item without a dimension, so it can be picked like any other', () => {
    const missing = structuredClone(projection);
    const requirement = missing.requirements.find((entry) => entry.id === 'button.primary.default.dark')!;
    delete requirement.subject.mode;
    const sparse = orderedRows(matrixOf(missing));

    expect(dimensionChoices(sparse).find((choice) => choice.name === 'mode')?.values).toEqual(['', 'light']);
    expect(pickRow(sparse, { variant: 'primary', mode: '', state: 'default' }, 'mode')?.requirement.id).toBe('button.primary.default.dark');
  });

  it('always returns a real item, even for a value nothing has', () => {
    expect(pickRow(rows, { variant: 'tertiary' }, 'variant')).toBeDefined();
    expect(pickRow([], { variant: 'primary' }, 'variant')).toBeUndefined();
  });
});

describe('choosing implementations', () => {
  it('keeps the matrix order, ignores unknown names and never ends up with none', () => {
    expect(selectedColumns(matrix.columns, ['vue', 'react']).map((column) => column.id)).toEqual(['react', 'vue']);
    expect(selectedColumns(matrix.columns, ['nope']).map((column) => column.id)).toEqual(['react', 'svelte', 'vue']);
    expect(selectedColumns(matrix.columns, undefined)).toHaveLength(3);
  });
});

describe('one item in detail', () => {
  const detailOf = (label: string, columns = matrix.columns, unusable: ReadonlySet<string> = new Set()) => {
    const row = rows.find((entry) => entry.label === label);
    if (!row) throw new Error(`no row ${label}`);
    return buildItemDetail({ row, projection, columns, unusableComparisonIds: unusable });
  };

  it('has one card per chosen implementation, from the data', () => {
    const detail = detailOf('primary hover light', matrix.columns.filter((column) => column.id !== 'vue'));

    expect(detail.adapters.map((card) => [card.column.id, card.outcome])).toEqual([['react', 'failed'], ['svelte', 'passed']]);
  });

  it('shows an implementation that was never compared as not compared, not as a pass', () => {
    const detail = detailOf('secondary default light');

    expect(detail.adapters.map((card) => [card.column.id, card.outcome, card.artifactPath === undefined])).toEqual([
      ['react', 'passed', false],
      ['svelte', 'none', true],
      ['vue', 'none', true]
    ]);
  });

  it('reads an implementation that did not run as not run', () => {
    expect(detailOf('secondary hover light').adapters.find((card) => card.column.id === 'vue')?.outcome).toBe('not-run');
  });

  it('marks an implementation whose evidence is unusable as unknown', () => {
    const detail = detailOf('primary hover light', matrix.columns, new Set(['button.primary.hover.light/react']));

    expect(detail.adapters.find((card) => card.column.id === 'react')?.unusable).toBe(false);
    const rebuilt = matrixOf(projection, new Set(['button.primary.hover.light/react']));
    const unusableRow = orderedRows(rebuilt).find((row) => row.label === 'primary hover light');
    expect(unusableRow?.cells.get('react')?.unusable).toBe(true);
  });

  it('tabulates every required proof for every implementation, with absent as not recorded', () => {
    const detail = detailOf('secondary default light');

    expect(detail.layerRows.find((entry) => entry.column.id === 'react')?.layers).toEqual([
      { layer: 'structural', outcome: 'passed' },
      { layer: 'visual', outcome: 'passed' }
    ]);
    expect(detail.layerRows.find((entry) => entry.column.id === 'vue')?.layers.map((layer) => layer.outcome)).toEqual(['absent', 'absent']);
  });

  it('reports the recorded threshold and says "none" when there is none', () => {
    expect(detailOf('primary hover light').facts.threshold).toEqual([{ name: 'ratio', value: 0.01 }]);
    expect(detailOf('primary default light').facts.threshold).toEqual([]);
  });

  it('counts the item\'s own comparisons, with their dates and viewports', () => {
    const { facts } = detailOf('primary hover light');

    expect(facts).toMatchObject({ viewports: ['1440x900'], comparisonsExecuted: 3, comparisonsPassed: 2, runFinishedAt: '2026-10-16T08:00:00.000Z', referenceCapturedAt: '2026-10-12T09:00:00.000Z' });
  });

  it('describes an item with no design and no comparison without inventing anything', () => {
    const detail = detailOf('primary default dark');

    expect(detail.reference).toMatchObject({ availability: 'missing', artifactPath: undefined });
    expect(detail.adapters.every((card) => card.outcome === 'none' && card.artifactPath === undefined)).toBe(true);
    expect(detail.facts).toMatchObject({ viewports: [], comparisonsExecuted: 0, comparisonsPassed: 0 });
  });
});

describe('page checks', () => {
  const pageRows = orderedRows(matrixOf(makeProjection()));

  it('shows failures and unproven items first, and never an item with no recorded comparison', () => {
    const { shown, total } = pageChecks(pageRows);

    expect(shown.map((row) => row.label)).toEqual(['hero.phone', 'faq.desktop', 'hero.desktop']);
    expect(total).toBe(6);
  });

  it('shows at least three when little needs attention, and at most six when a lot does', () => {
    const many = pageRows.length;
    const clones = (count: number) => Array.from({ length: count }, (_, index) => ({ ...pageRows[0]!, label: `failed-${index}`, group: 'failed' as const }));

    expect(pageChecks(clones(1)).shown).toHaveLength(1);
    expect(pageChecks([...clones(1), ...pageRows.filter((row) => row.group === 'passed')]).shown.length).toBeGreaterThanOrEqual(1);
    expect(pageChecks(clones(10)).shown).toHaveLength(6);
    expect(many).toBeGreaterThan(0);
  });
});
