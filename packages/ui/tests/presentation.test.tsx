import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { orderedRows } from '../src/model/gallery-model';
import { buildMatrix } from '../src/model/matrix-model';
import { presentRows } from '../src/model/presentation';
import { groupBySubject, type SubjectGroup } from '../src/model/subject-model';
import { screensDemo } from '../scripts/demo-screens';
import { makeCatalog } from './helpers/test-bundles';
import { renderApp } from './helpers/render-app';

// 6 app states on desktop and mobile, 2 emails on phone: 14 items. Screen 5 fails, 7 errors, 11 has no comparison.
const projection = screensDemo({ pageId: 'login', label: 'Login', appStates: 6, appDevices: ['desktop', 'mobile'], emailStates: 2, emailDevices: ['phone'] });
const subject = groupBySubject(projection)[0] as SubjectGroup;
const rows = orderedRows(buildMatrix({ projection, subject, unusableComparisonIds: new Set() }));
const inProviderOrder = subject.requirements.map((requirement) => rows.find((row) => row.requirement.id === requirement.id)!);

describe('laying out a page by the provider\'s hint', () => {
  it('makes sections, one group per state, and puts the devices side by side', () => {
    const sections = presentRows(inProviderOrder, subject.presentation)!;

    expect(sections.map((section) => section.title)).toEqual(['app', 'email']);
    expect(sections[0]!.columns).toEqual(['desktop', 'mobile']);
    expect(sections[1]!.columns).toEqual(['phone']);
    expect(sections[0]!.groups).toHaveLength(6);
    expect(sections[0]!.groups.flatMap((group) => group.cells.flatMap((cell) => cell.rows))).toHaveLength(12);
  });

  it('puts a group with a failing item first, then one with an unproven item, and keeps the provider\'s order otherwise', () => {
    const keys = presentRows(inProviderOrder, subject.presentation)![0]!.groups.map((group) => group.key);

    // Screen 5 (step-03 mobile) fails; screen 7 (step-04 mobile) errors and screen 11 (step-06 mobile) has no comparison.
    expect(keys).toEqual(['step-03', 'step-04', 'step-06', 'step-01', 'step-02', 'step-05']);
  });

  it('keeps the default layout without a hint, or when no item has the grouping dimension', () => {
    expect(presentRows(inProviderOrder, undefined)).toBeUndefined();
    expect(presentRows(inProviderOrder, { groupBy: 'locale' })).toBeUndefined();
  });

  it('never hides two items that share a group and a column', () => {
    const sections = presentRows(inProviderOrder, { groupBy: 'surface' })!;
    expect(sections[0]!.groups.find((group) => group.key === 'app')!.cells[0]!.rows).toHaveLength(12);
  });
});

describe('the page view with a hint', () => {
  it('shows every item in its section and state, with the failing one outlined first', async () => {
    renderApp(await makeCatalog([{ id: 'login-1', projection }]), '/bundles/login-1/pages/login');

    const app = within(await screen.findByRole('region', { name: 'app' }));
    const first = app.getAllByRole('article')[0]!;
    expect(first).toHaveAccessibleName('step-03');
    expect(within(first).getByRole('link', { name: /step-03\.mobile: Failing/ }).closest('.cell')).toHaveClass('failed');
    expect(within(screen.getByRole('region', { name: 'email' })).getAllByRole('article')).toHaveLength(2);
    expect(screen.getByText(/All 14 required items, laid out as the provider describes them; 1 failing and 2 not proven first/)).toBeInTheDocument();
  });
});
