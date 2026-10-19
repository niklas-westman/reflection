import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { projectionSchema, summarizeReadiness, type Projection } from 'reflection-projection';
import { buildAttention, sortByAttention } from '../src/model/attention';
import { groupBySubject } from '../src/model/subject-model';
import { makeCatalog, makeProjection } from './helpers/test-bundles';
import { renderApp } from './helpers/render-app';

const overviewPath = '/bundles/docs-site';

function withComponents(base: Projection, names: string[]): Projection {
  const requirements = names.map((name) => ({ id: `${name}.default`, label: `${name}.default`, subject: { kind: 'component' as const, id: name }, requiredProofs: ['visual' as const], enrolled: true }));
  const comparisons = names.map((name) => ({
    id: `${name}.default/react`,
    requirementId: `${name}.default`,
    subject: { kind: 'component' as const, id: name, adapter: 'react' },
    runId: 'run-1',
    actual: { role: 'actual' as const, path: `artifacts/${name}.png` },
    proof: { visual: 'passed' as const },
    verdict: { status: 'pass' as const, severity: 'review' as const }
  }));
  return projectionSchema.parse({ ...base, requirements: [...base.requirements, ...requirements], comparisons: [...base.comparisons, ...comparisons] });
}

function withDelta(projection: Projection, against: string | null, sameSnapshot: boolean): Projection {
  const after = summarizeReadiness(projection.requirements, projection.comparisons, projection.provider.readinessConcepts);
  return projectionSchema.parse({
    ...projection,
    delta: {
      against,
      sameSnapshot,
      regressed: [{ comparisonId: 'hero.phone/chrome' }],
      fixed: [{ comparisonId: 'faq.desktop/chrome' }, { comparisonId: 'hero.desktop/chrome' }],
      stillFailing: [],
      newlyEnrolled: ['banner.desktop'],
      newInDesign: [{ key: 'button/raised', label: 'Raised', kind: 'component-variant' }],
      stillProposed: [],
      removedInDesign: [],
      coverage: { before: null, after }
    }
  });
}

async function openOverview(projection: Projection, options: { release?: Parameters<typeof makeCatalog>[0][number]['release'] } = {}): Promise<void> {
  const catalog = await makeCatalog([{ id: 'docs-site', projection, ...(options.release ? { release: options.release } : {}) }]);
  renderApp(catalog, overviewPath);
  await screen.findByRole('heading', { name: 'Release status' });
}

const attention = () => within(screen.getByLabelText('Needs attention'));

describe('the attention model', () => {
  const subjects = groupBySubject(makeProjection());

  it('derives what to look at from the recorded data, in a fixed order', () => {
    const items = buildAttention({ projection: makeProjection(), subjects, unusableComparisonIds: new Set() });

    expect(items.map((item) => [item.kind, item.count])).toEqual([
      ['failures', 1],
      ['needs-design', 1],
      ['not-enrolled', 1],
      ['not-proven', 2]
    ]);
  });

  it('counts failures in comparisons, which can be more than the required items that fail', () => {
    const projection = makeProjection();
    const firefox = projection.comparisons.find((comparison) => comparison.id === 'hero.phone/firefox');
    if (firefox) firefox.proof = { visual: 'failed' };

    const [failures] = buildAttention({ projection, subjects: groupBySubject(projection), unusableComparisonIds: new Set() });

    // One required item fails, in two implementations.
    expect(failures).toMatchObject({ kind: 'failures', count: 2 });
    expect(groupBySubject(projection)[0]?.summary.failing).toBe(1);
  });

  it('names the subjects and the outcome group each item opens', () => {
    const [failures] = buildAttention({ projection: makeProjection(), subjects, unusableComparisonIds: new Set() });

    expect(failures).toMatchObject({ kind: 'failures', outcome: 'failed', subjects: [{ id: 'pricing', kind: 'page' }] });
  });

  it('leaves out a count the provider has no concept of, instead of reporting zero', () => {
    const projection = makeProjection({ provider: { name: 'p', readinessConcepts: { needsDesign: false, notEnrolled: false }, capabilities: [] } });

    const kinds = buildAttention({ projection, subjects: groupBySubject(projection), unusableComparisonIds: new Set() }).map((item) => item.kind);

    expect(kinds).not.toContain('needs-design');
    expect(kinds).not.toContain('not-enrolled');
  });

  it('counts unusable evidence and unconfirmed references', () => {
    const projection = makeProjection();
    for (const comparison of projection.comparisons) {
      if (comparison.reference) comparison.reference.approval = { state: 'holds', attestation: 'agent', by: 'script', at: '2026-10-14T09:00:00.000Z' };
    }

    const items = buildAttention({ projection, subjects: groupBySubject(projection), unusableComparisonIds: new Set(['hero.phone/chrome']) });

    expect(items.find((item) => item.kind === 'unusable-evidence')?.count).toBe(1);
    expect(items.find((item) => item.kind === 'unconfirmed-references')?.count).toBe(6);
  });

  it('orders subjects with failures first, then the most unresolved', () => {
    const projection = withComponents(makeProjection(), ['alpha', 'zeta']);
    projection.comparisons = projection.comparisons.filter((comparison) => comparison.id !== 'alpha.default/react');

    const names = sortByAttention(groupBySubject(projection)).map((subject) => subject.id);

    expect(names).toEqual(['pricing', 'alpha', 'zeta']);
  });
});

describe('the release overview', () => {
  it('lists what needs attention with the subjects it comes from, each opening the right group', async () => {
    await openOverview(makeProjection());

    expect(attention().getByText('1 comparison failure')).toBeInTheDocument();
    expect(attention().getByText('1 required item needs a design selection')).toBeInTheDocument();
    expect(attention().getByText('2 required items not proven')).toBeInTheDocument();
    const failureItem = attention().getByText('1 comparison failure').closest('li') as HTMLElement;
    expect(within(failureItem).getByRole('link', { name: 'pricing' })).toHaveAttribute('href', '#/bundles/docs-site/pages/pricing?view=items&outcome=failed');
    const designItem = attention().getByText('1 required item needs a design selection').closest('li') as HTMLElement;
    expect(within(designItem).getByRole('link', { name: 'pricing' })).toHaveAttribute('href', '#/bundles/docs-site/pages/pricing?view=items&outcome=missing');
  });

  it('warns about references a person has not confirmed', async () => {
    const projection = makeProjection();
    for (const comparison of projection.comparisons) {
      if (comparison.reference) comparison.reference.approval = { state: 'holds', attestation: 'agent', by: 'script', at: '2026-10-14T09:00:00.000Z' };
    }
    await openOverview(projection);

    expect(attention().getByText('6 reference approvals not confirmed by a person')).toBeInTheDocument();
  });

  it('says plainly when nothing was recorded that needs attention, without calling the release done', async () => {
    const projection = makeProjection();
    projection.requirements = projection.requirements.filter((requirement) => ['hero.desktop'].includes(requirement.id));
    projection.comparisons = projection.comparisons.filter((comparison) => comparison.requirementId === 'hero.desktop');
    await openOverview(projection);

    expect(attention().getByText('No failures, missing items or unusable evidence were recorded in this bundle.')).toBeInTheDocument();
    expect(screen.queryByText(/all clear|compliant|complete/i)).not.toBeInTheDocument();
  });

  it('gives each subject one coverage line in required items and no comparison totals', async () => {
    await openOverview(withComponents(makeProjection(), ['button']));

    const card = within(screen.getByLabelText('Pages')).getByRole('link', { name: /pricing/ });
    expect(card).toHaveTextContent('1 proven of 6 required');
    expect(card).toHaveTextContent('1 failing · 4 unresolved');
    expect(card).toHaveTextContent('1 need design · 1 not enrolled · 2 not proven');
    expect(card).not.toHaveTextContent(/executed|passed/i);
  });

  it('shows no percentage anywhere', async () => {
    await openOverview(withDelta(makeProjection(), '2.3.0', true));

    expect(document.body.textContent).not.toContain('%');
  });

  it('shows every source with its own date and the run, and the branch and commit when recorded', async () => {
    await openOverview(makeProjection(), { release: { branch: 'release/2.4', commit: 'abcdef1234567' } });

    const facts = within(screen.getByLabelText('Provenance'));
    expect(facts.getByText('Reference screenshots, captured 14 Oct 2026')).toBeInTheDocument();
    expect(facts.getByText('15 Oct 2026 · screenshot-compare 2.1.0 · 3 days before this build')).toBeInTheDocument();
    expect(facts.getByText('release/2.4 · abcdef1')).toBeInTheDocument();
  });
});

describe('changes since the previous release', () => {
  it('shows what the delta records and states whether the design snapshot was the same', async () => {
    await openOverview(withDelta(makeProjection(), '2.3.0', true));

    const card = within(screen.getByLabelText('Changes since the previous release'));
    expect(card.getByText('Since 2.3.0')).toBeInTheDocument();
    expect(card.getByText('Regressed').nextSibling).toHaveTextContent('1');
    expect(card.getByText('Fixed').nextSibling).toHaveTextContent('2');
    expect(card.getByText('New in the design source').nextSibling).toHaveTextContent('1');
    expect(card.getByText('Same design snapshot as 2.3.0.')).toBeInTheDocument();
  });

  it('is absent when the bundle has no delta, rather than claiming nothing changed', async () => {
    await openOverview(makeProjection());

    expect(screen.queryByLabelText('Changes since the previous release')).not.toBeInTheDocument();
  });

  it('is absent for a first release, which has nothing to compare with', async () => {
    await openOverview(withDelta(makeProjection(), null, false));

    expect(screen.queryByLabelText('Changes since the previous release')).not.toBeInTheDocument();
  });
});

describe('a release with many subjects', () => {
  it('shows the first twelve by attention and the rest on request, still counting them all', async () => {
    const names = Array.from({ length: 14 }, (_, index) => `part-${String(index).padStart(2, '0')}`);
    await openOverview(withComponents(makeProjection(), names));

    const components = within(screen.getByLabelText('Components'));
    expect(screen.getByRole('heading', { name: 'Components (14)' })).toBeInTheDocument();
    expect(components.getAllByRole('link')).toHaveLength(12);

    await userEvent.click(components.getByRole('button', { name: 'View all 14 components' }));

    expect(components.getAllByRole('link')).toHaveLength(14);
  });
});

describe('approvals a person gave in conversation', () => {
  const delegate = (projection: Projection): Projection => {
    for (const comparison of projection.comparisons) {
      if (comparison.reference) comparison.reference.approval = { state: 'holds', attestation: 'delegated', by: 'Owner', recordedBy: 'Assistant', at: '2026-10-13T20:56:08.000Z', note: 'Looks right.' };
    }
    return projection;
  };

  it('points to the notes in a neutral line, without counting them as something wrong', async () => {
    const projection = delegate(makeProjection());
    const delegated = projection.comparisons.filter((comparison) => comparison.reference).length;
    await openOverview(projection);

    const note = attention().getByText(new RegExp(`^${delegated} reference approvals were written down by an agent`));
    expect(note).not.toHaveTextContent('▲');
    expect(within(note).getByRole('link', { name: 'Read the notes' })).toHaveAttribute('href', '#/bundles/docs-site/design-references');
    expect(attention().queryByText(/not confirmed by a person/)).not.toBeInTheDocument();
  });

  it('says nothing when every approval was recorded by a person', async () => {
    await openOverview(makeProjection());

    expect(attention().queryByText(/written down by an agent/)).not.toBeInTheDocument();
  });
});
