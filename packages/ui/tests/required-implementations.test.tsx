import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { projectionSchema, type Projection } from 'reflection-projection';
import { buildAttention } from '../src/model/attention';
import { buildInspectorModel } from '../src/model/inspector-model';
import { NO_FILTERS } from '../src/model/filters';
import { buildMatrix } from '../src/model/matrix-model';
import { groupBySubject } from '../src/model/subject-model';
import { makeCatalog, makeComponentProjection } from './helpers/test-bundles';
import { renderApp } from './helpers/render-app';

// Every button requirement must pass in react, vue and svelte (unless the test says otherwise).
function withRequired(projection: Projection, implementations: string[]): Projection {
  return projectionSchema.parse({ ...projection, requirements: projection.requirements.map((requirement) => ({ ...requirement, requiredImplementations: implementations })) });
}

const strict = (): Projection => withRequired(makeComponentProjection(), ['react', 'vue', 'svelte']);
const buttonPath = '/bundles/components/components/button';

async function open(path: string, projection = strict()): Promise<void> {
  renderApp(await makeCatalog([{ id: 'components', projection }]), path);
  await screen.findByRole('heading', { level: 1, name: 'button' });
}

describe('required implementations in the model', () => {
  it('leave an item not proven when one is missing, and prove it when all pass', () => {
    const [subject] = groupBySubject(strict());
    const matrix = buildMatrix({ projection: strict(), subject: subject!, unusableComparisonIds: new Set() });
    const rows = matrix.groups.flatMap((group) => group.rows);

    expect(rows.find((row) => row.label === 'primary default light')?.readiness).toBe('proven');
    expect(rows.find((row) => row.label === 'secondary default light')?.readiness).toBe('unknown');
    expect(rows.find((row) => row.label === 'primary hover light')?.readiness).toBe('failing');
  });

  it('give the reason and the names of what is missing', () => {
    const [subject] = groupBySubject(strict());
    const row = buildMatrix({ projection: strict(), subject: subject!, unusableComparisonIds: new Set() }).groups.flatMap((group) => group.rows).find((entry) => entry.label === 'secondary default light');

    expect(row?.reason).toBe('Not compared in every required implementation');
    expect(row?.detail).toBe('Required implementations not compared: vue, svelte');
  });

  it('give an implementation nobody ever compared a column of its own', () => {
    const projection = withRequired(makeComponentProjection(), ['react', 'angular']);
    const [subject] = groupBySubject(projection);

    expect(buildMatrix({ projection, subject: subject!, unusableComparisonIds: new Set() }).columns.map((column) => column.id)).toEqual(['angular', 'react', 'svelte', 'vue']);
  });

  it('count in attention as their own item, and not when the item already fails', () => {
    const items = buildAttention({ projection: strict(), subjects: groupBySubject(strict()), unusableComparisonIds: new Set() });
    const missing = items.find((item) => item.kind === 'missing-implementations');

    // secondary default (react only) and secondary hover (react passed, vue did not run): both lack a required implementation.
    expect(missing?.count).toBe(2);
    expect(missing).toMatchObject({ outcome: 'not-proven', subjects: [{ id: 'button' }] });
  });

  it('say so in the inspector gaps, apart from implementations that are simply not required', () => {
    const projection = withRequired(makeComponentProjection(), ['react', 'vue']);
    const [subject] = groupBySubject(projection);
    const matrix = buildMatrix({ projection, subject: subject!, unusableComparisonIds: new Set() });
    const gaps = buildInspectorModel({ projection, matrix, filters: NO_FILTERS, comparisonId: 'button.secondary.default.light/react', unusableComparisonIds: new Set(), bundleHash: 'f'.repeat(64), builtAt: '2026-10-18T10:00:00.000Z', validity: { state: 'offline' } })?.gaps ?? [];

    expect(gaps).toContain('A required implementation was not compared, so the item is not proven: vue.');
    expect(gaps).toContain('This item was not compared in: svelte.');
  });
});

describe('required implementations on screen', () => {
  it('shows the item as not proven in the inventory, with what is missing', async () => {
    await open(`${buttonPath}?view=items`);

    const group = within(screen.getByRole('rowgroup', { name: 'Not proven' }));
    expect(group.getByText('secondary default light')).toBeInTheDocument();
    expect(group.getByText('Required implementations not compared: vue, svelte')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Not proven/ })).toHaveTextContent('not compared in every required implementation');
  });

  it('counts only items that pass in every required implementation as proven', async () => {
    await open(buttonPath);

    const term = within(screen.getByLabelText('Required items')).getByText('Proven', { selector: 'dt' });
    expect(term.parentElement?.querySelector('dd')?.textContent).toBe('1');
  });

  it('says in the gallery that the item is not proven until each required implementation passes, and marks required cards', async () => {
    await open(`${buttonPath}?item=button.secondary.default.light`);

    const details = within(screen.getByLabelText('Verification details'));
    expect(details.getByText('Not proven')).toBeInTheDocument();
    expect(details.getByText('Not proven until each required implementation passes. Not compared in: vue, svelte.')).toBeInTheDocument();
    expect(within(screen.getByLabelText('Reference and implementations')).getAllByText('· required')).toHaveLength(3);
  });

  it('keeps the older note for implementations that are not required', async () => {
    const projection = withRequired(makeComponentProjection(), ['react']);
    await open(`${buttonPath}?item=button.secondary.default.light`, projection);

    const details = within(screen.getByLabelText('Verification details'));
    expect(details.getByText('Proven')).toBeInTheDocument();
    expect(details.getByText('Not compared in: svelte, vue. The status covers only what was compared.')).toBeInTheDocument();
    expect(details.queryByText(/Not proven until each required implementation passes/)).not.toBeInTheDocument();
  });

  it('shows a card for a required implementation nothing was ever compared in', async () => {
    const projection = withRequired(makeComponentProjection(), ['react', 'angular']);
    await open(`${buttonPath}?item=button.primary.default.light`, projection);

    const angular = within(screen.getByLabelText('Reference and implementations').querySelector('[aria-label="angular"]') as HTMLElement);
    expect(angular.getAllByText('Not compared').length).toBeGreaterThan(0);
  });

  it('lists the item in the release attention card', async () => {
    renderApp(await makeCatalog([{ id: 'components', projection: strict() }]), '/bundles/components');
    await screen.findByRole('heading', { name: 'Release status' });

    expect(within(screen.getByLabelText('Needs attention')).getByText('2 required items are not compared in every required implementation')).toBeInTheDocument();
  });
});
