import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { bindingForComparisons, projectionSchema, type Projection } from 'reflection-projection';
import { makeCatalog, makeProjection } from './helpers/test-bundles';
import { renderApp } from './helpers/render-app';

// The owner raised the limit for the passing comparisons of one item; the provider imported that decision.
function accepted(change?: (projection: Projection) => void): { projection: Projection; ids: string[] } {
  const projection = makeProjection();
  const ids = projection.comparisons.filter((comparison) => comparison.requirementId === 'hero.desktop' && comparison.proof.visual === 'passed').map((comparison) => comparison.id);
  // A binding needs the reference hashes the bundle will carry; the baseline hash is the provider's own and the writer keeps it.
  for (const comparison of projection.comparisons) if (comparison.reference) comparison.reference.baselineSha256 = 'b'.repeat(64);
  const withDecision = projectionSchema.parse({
    ...projection,
    decisions: [
      {
        id: 'raised-limit',
        kind: 'accept-deviation',
        bundleId: 'earlier-build',
        by: 'Owner',
        recordedBy: 'Assistant',
        at: '2026-10-16T10:00:00.000Z',
        attestation: 'delegated',
        comment: 'Label-only text differences are fine up to 110 px.',
        scope: { comparisonIds: ids },
        binding: bindingForComparisons(projection, ids)
      }
    ]
  });
  change?.(withDecision);
  return { projection: withDecision, ids };
}

async function open(projection: Projection, path: string): Promise<void> {
  renderApp(await makeCatalog([{ id: 'docs-site', projection }]), path);
}

describe('a deviation the owner accepted', () => {
  it('is counted on the overview in proven items, apart from any warning', async () => {
    const { projection } = accepted();
    await open(projection, '/bundles/docs-site');
    await screen.findByRole('heading', { name: 'Release status' });

    expect(within(screen.getByLabelText('Needs attention')).getByText(/^1 proven item passes within a deviation the owner accepted/)).toBeInTheDocument();
  });

  it('marks the cell in the table and shows the decision, carried forward, on the comparison', async () => {
    const { projection, ids } = accepted();
    await open(projection, '/bundles/docs-site/pages/pricing?view=items');
    const row = await screen.findByRole('row', { name: /hero\.desktop/ });
    expect(within(row).getAllByText('accepted').length).toBeGreaterThan(0);

    await open(projection, `/bundles/docs-site/pages/pricing/comparisons/${encodeURIComponent(ids[0]!)}`);
    const card = within(await screen.findByLabelText('Accepted deviation'));
    expect(card.getByText('Carried forward from build earlier-build: nothing it was bound to changed.')).toBeInTheDocument();
    expect(card.getByText('Label-only text differences are fine up to 110 px.')).toBeInTheDocument();
    expect(within(screen.getByLabelText('Verification result')).getByText('Passed')).toBeInTheDocument();
  });

  it('says when it no longer holds because the result changed', async () => {
    const { projection } = accepted((changed) => {
      const target = changed.comparisons.find((comparison) => comparison.id === changed.decisions[0]!.scope!.comparisonIds![0]);
      target!.verdict = { status: 'pass', severity: 'review' };
    });
    await open(projection, '/bundles/docs-site');
    await screen.findByRole('heading', { name: 'Release status' });

    expect(within(screen.getByLabelText('Needs attention')).getByText(/1 accepted deviation no longer holds/)).toBeInTheDocument();
  });
});
