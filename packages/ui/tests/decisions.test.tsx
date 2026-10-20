import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { openBundle, recordDecision, type Decision } from 'reflection-projection';
import type { BundleCatalog } from '../src/data/bundle-catalog';
import { makeCatalog, makeProjection } from './helpers/test-bundles';
import { renderApp } from './helpers/render-app';

const overviewPath = '/bundles/docs-site';

// Decisions as a host records them: built on the server from the stored bundle.
async function decided(make: (bundle: { manifest: never; projection: never }) => Decision[]): Promise<Decision[]> {
  const probe = await makeCatalog([{ id: 'docs-site', projection: makeProjection() }]);
  const opened = await openBundle(probe.source('docs-site'));
  if (opened.status !== 'opened') throw new Error('bundle did not open');
  return make(opened.bundle as never);
}

async function openOverview(catalog: BundleCatalog): Promise<ReturnType<typeof within>> {
  renderApp(catalog, overviewPath);
  return within(await screen.findByLabelText('Decision'));
}

describe('the release decision', () => {
  it('is not shown when the host records no decisions', async () => {
    renderApp(await makeCatalog([{ id: 'docs-site', projection: makeProjection() }]), overviewPath);
    await screen.findByRole('heading', { name: 'Release status' });
    expect(screen.queryByLabelText('Decision')).not.toBeInTheDocument();
  });

  it('says when nobody has decided yet', async () => {
    const card = await openOverview(await makeCatalog([{ id: 'docs-site', projection: makeProjection() }], { decisions: [] }));
    expect(await card.findByText('No decision yet')).toBeInTheDocument();
  });

  it('shows who approved this build, with their words', async () => {
    const decisions = await decided((bundle) => [recordDecision({ request: { bundleId: (bundle as { manifest: { release: { bundleId: string } } }).manifest.release.bundleId, kind: 'approve', comment: 'Pricing reads right.' }, bundle, identity: { email: 'designer@example.com' }, id: 'd-1', at: '2026-10-21T09:00:00.000Z' })]);
    const card = await openOverview(await makeCatalog([{ id: 'docs-site', projection: makeProjection() }], { decisions }));

    expect(await card.findByText('Approved')).toBeInTheDocument();
    expect(card.getByText('Approved by designer@example.com on 21 Oct 2026.')).toBeInTheDocument();
    expect(card.getByText('“Pricing reads right.”')).toBeInTheDocument();
    expect(card.getByText('It was made on this build.')).toBeInTheDocument();
  });

  it('says a decision made on other content no longer applies, and a withdrawn one is gone', async () => {
    const decisions = await decided((bundle) => {
      const bundleId = (bundle as { manifest: { release: { bundleId: string } } }).manifest.release.bundleId;
      const approve = recordDecision({ request: { bundleId, kind: 'approve' }, bundle, identity: { email: 'designer@example.com' }, id: 'd-1', at: '2026-10-21T09:00:00.000Z' });
      return [{ ...approve, binding: { ...approve.binding!, verdicts: { ...approve.binding!.verdicts, extra: 'pass/info/-' } } }];
    });
    const card = await openOverview(await makeCatalog([{ id: 'docs-site', projection: makeProjection() }], { decisions }));
    expect(await card.findByText('▲ Approved, on an earlier build')).toBeInTheDocument();
    expect(card.getByText(/no longer applies: 1 thing it judged changed/)).toBeInTheDocument();
  });

  it('leaves out a decision that was withdrawn', async () => {
    const decisions = await decided((bundle) => {
      const bundleId = (bundle as { manifest: { release: { bundleId: string } } }).manifest.release.bundleId;
      return [
        recordDecision({ request: { bundleId, kind: 'approve' }, bundle, identity: { email: 'designer@example.com' }, id: 'd-1', at: '2026-10-21T09:00:00.000Z' }),
        recordDecision({ request: { bundleId, kind: 'withdrawn', target: 'd-1' }, bundle, identity: { email: 'designer@example.com' }, id: 'w-1', at: '2026-10-21T10:00:00.000Z' })
      ];
    });
    const card = await openOverview(await makeCatalog([{ id: 'docs-site', projection: makeProjection() }], { decisions }));
    expect(await card.findByText('No decision yet')).toBeInTheDocument();
    expect(card.getByText(/2 records for this release/)).toBeInTheDocument();
  });

  it('says when the decisions could not be loaded, rather than showing none', async () => {
    const card = await openOverview(await makeCatalog([{ id: 'docs-site', projection: makeProjection() }], { decisions: new Error('The decisions could not be loaded (HTTP 403).') }));
    expect(await card.findByRole('alert')).toHaveTextContent('HTTP 403');
  });
});

describe('the latest bundle', () => {
  it('is marked in the list, and one the host names but does not hold is said out loud', async () => {
    renderApp(await makeCatalog([{ id: 'docs-site', projection: makeProjection() }], { latest: { 'docs-site': 'docs-site', other: 'gone-bundle' } }), '/');

    expect(await screen.findByText('Latest')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('The host names gone-bundle as the latest bundle of other, but that bundle is not here.');
  });
});
