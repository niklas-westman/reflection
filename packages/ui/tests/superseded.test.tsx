import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { projectionSchema, type Projection } from 'reflection-projection';
import { makeCatalog, makeProjection } from './helpers/test-bundles';
import { renderApp } from './helpers/render-app';

// Every comparison read the "references" snapshot; a later export replaced it.
function superseded(): Projection {
  const projection = makeProjection();
  const old = projection.snapshots[0]!;
  return projectionSchema.parse({ ...projection, snapshots: [{ ...old, supersededBy: 'references-new' }, { ...old, id: 'references-new', label: 'New reference screenshots', capturedAt: '2026-10-20T08:00:00.000Z' }] });
}

async function open(path: string, projection = superseded()): Promise<void> {
  renderApp(await makeCatalog([{ id: 'docs-site', projection }]), path);
}

describe('evidence from a superseded design source', () => {
  it('is counted as not proven on the overview, with a needs-attention item that says why', async () => {
    await open('/bundles/docs-site');
    await screen.findByRole('heading', { name: 'Release status' });

    const attention = within(screen.getByLabelText('Needs attention'));
    expect(attention.getByText(/comparisons proved a superseded design source/)).toBeInTheDocument();
    expect(attention.queryByText(/comparison failure/)).not.toBeInTheDocument();
  });

  it('gives each row the reason and each cell the words, never a pass or a failure', async () => {
    await open('/bundles/docs-site/pages/pricing?view=items');

    const row = await screen.findByRole('row', { name: /hero\.desktop/ });
    expect(screen.getByRole('button', { name: /Not proven.*proved a superseded design source/ })).toBeInTheDocument();
    expect(within(row).getByText(/Checked against a design source that was later superseded/)).toBeInTheDocument();
    expect(within(row).getAllByText('Unknown: superseded design source').length).toBeGreaterThan(0);
    expect(within(row).queryByText('Passed')).not.toBeInTheDocument();
  });

  it('says on the comparison what it proved, what replaced it, and what it recorded', async () => {
    const projection = superseded();
    const comparison = projection.comparisons.find((entry) => entry.proof.visual === 'passed')!;
    await open(`/bundles/docs-site/pages/pricing/comparisons/${encodeURIComponent(comparison.id)}`, projection);

    expect(await screen.findByText(/Evidence from a superseded design source\. This check proved Reference screenshots, captured 14 Oct 2026; the design moved on to New reference screenshots, captured 20 Oct 2026/)).toBeInTheDocument();
    const result = within(screen.getByLabelText('Verification result'));
    expect(result.getByText('Unknown: superseded design source')).toBeInTheDocument();
    expect(result.getByText(/Recorded as passed against a design source that was superseded/)).toBeInTheDocument();
  });
});
