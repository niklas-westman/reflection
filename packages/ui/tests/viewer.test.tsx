import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { collectArtifactRefs } from 'reflection-projection';
import { makeCatalog, makeProjection, overwrite } from './helpers/test-bundles';
import { renderApp } from './helpers/render-app';

const subjectPath = '/bundles/docs-site/subjects/pricing';

async function openSubject(path = subjectPath): Promise<void> {
  const catalog = await makeCatalog([{ id: 'docs-site', projection: makeProjection() }]);
  renderApp(catalog, path);
  await screen.findByRole('heading', { level: 1, name: 'pricing' });
}

describe('the subject page', () => {
  it('shows required items and comparisons as separate groups, from the shared counts', async () => {
    await openSubject();

    const summary = screen.getByLabelText('Summary');
    expect(summary).toHaveTextContent('6 required · 1 proven · 1 failing · 1 needs design · 1 not enrolled · 2 not proven');
    expect(summary).toHaveTextContent('5 executed · 4 passed · 1 failed · 1 not run');
  });

  it('lists the failure first and leaves Missing collapsed with its reasons', async () => {
    await openSubject();

    const groups = screen.getAllByRole('rowgroup').slice(1);
    expect(groups.map((group) => group.getAttribute('aria-label'))).toEqual(['Failed', 'Not proven', 'Passed', 'Missing']);
    expect(within(groups[0]!).getByText('hero.phone')).toBeInTheDocument();

    const missing = within(groups[3]!);
    expect(missing.getByRole('button', { name: /Missing/ })).toHaveAttribute('aria-expanded', 'false');
    expect(missing.getByText(/1 no design selected · 1 not enrolled/)).toBeInTheDocument();
    expect(missing.queryByText('promo.desktop')).not.toBeInTheDocument();
  });

  it('expands Missing on request and shows the provider explanation on the row', async () => {
    await openSubject();

    await userEvent.click(screen.getByRole('button', { name: /Missing/ }));

    expect(screen.getByText('promo.desktop')).toBeInTheDocument();
    expect(screen.getByText('No design has been selected for the promo banner')).toBeInTheDocument();
  });

  it('shows the reference as availability and source, with no verdict', async () => {
    await openSubject();

    const row = screen.getByRole('row', { name: /hero\.desktop/ });
    expect(within(row).getByText('Reference screenshots')).toBeInTheDocument();
    expect(within(row).getByText('Approved by a person')).toBeInTheDocument();
  });

  it('links a cell to its comparison and says what it holds', async () => {
    await openSubject();

    const failedCell = screen.getByRole('link', { name: 'hero.phone, chrome: Failed' });

    expect(failedCell).toHaveAttribute('href', '#/bundles/docs-site/subjects/pricing/comparisons/hero.phone%2Fchrome');
  });

  it('says where the proof came from, with its own date', async () => {
    await openSubject();

    expect(screen.getByText(/Proof based on Reference screenshots, captured 14 Oct 2026/)).toBeInTheDocument();
  });

  it('reads a sound bundle as offline and never as current', async () => {
    await openSubject();

    expect(await screen.findByText(/Offline bundle · freshness not verified/)).toBeInTheDocument();
    expect(screen.queryByText(/Evidence current/)).not.toBeInTheDocument();
  });

  it('filters from the address and keeps the totals visible', async () => {
    await openSubject(`${subjectPath}?q=phone`);

    expect(screen.getByText('Showing 1 of 6 items')).toBeInTheDocument();
    expect(screen.getByText('hero.phone')).toBeInTheDocument();
    expect(screen.queryByText('hero.desktop')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Summary')).toHaveTextContent('6 required');
  });

  it('removes an outcome filter with its chip', async () => {
    await openSubject(`${subjectPath}?outcome=failed`);
    expect(screen.queryByText('hero.desktop')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Remove filter Failed' }));

    await waitFor(() => expect(screen.getByRole('button', { name: /Passed/ })).toBeInTheDocument());
  });

  it('explains an empty result and offers to clear the filters', async () => {
    await openSubject(`${subjectPath}?q=nothing-matches-this`);

    expect(screen.getByText('No items match these filters.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    await waitFor(() => expect(screen.getByText('hero.phone')).toBeInTheDocument());
  });

  it('shows only a glyph per cell in status-only density, still named for assistive technology', async () => {
    await openSubject(`${subjectPath}?density=status-only`);

    const cell = screen.getByRole('link', { name: 'hero.phone, chrome: Failed' });
    // The only text is the glyph's own name; there is no visible label beside it.
    expect(cell.textContent).toBe('Failed');
    expect(within(cell).getByRole('img', { name: 'Failed' })).toBeInTheDocument();
  });

  it('says so when the subject is not in the bundle', async () => {
    const catalog = await makeCatalog([{ id: 'docs-site', projection: makeProjection() }]);
    renderApp(catalog, '/bundles/docs-site/subjects/nothing');

    expect(await screen.findByText(/No subject called “nothing” in this bundle/)).toBeInTheDocument();
  });

  it('opens the first subject from the bundle address', async () => {
    const catalog = await makeCatalog([{ id: 'docs-site', projection: makeProjection() }]);
    renderApp(catalog, '/bundles/docs-site');

    expect(await screen.findByRole('heading', { level: 1, name: 'pricing' })).toBeInTheDocument();
  });
});

describe('counts a provider cannot give', () => {
  it('shows an unknown bucket as unknown, never as 0', async () => {
    const projection = makeProjection({ provider: { name: 'p', readinessConcepts: { needsDesign: false, notEnrolled: false }, capabilities: [] } });
    const catalog = await makeCatalog([{ id: 'docs-site', projection }]);
    renderApp(catalog, subjectPath);
    await screen.findByRole('heading', { level: 1, name: 'pricing' });

    const summary = screen.getByLabelText('Summary');
    expect(summary).toHaveTextContent('unknown needs design · unknown not enrolled');
    expect(summary).not.toHaveTextContent('0 needs design');
  });

  it('warns that the count is a lower bound when only what ran is listed', async () => {
    const catalog = await makeCatalog([{ id: 'docs-site', projection: makeProjection({ inventory: 'executed-only' }) }]);
    renderApp(catalog, subjectPath);

    expect(await screen.findByText('Only checks that ran are listed')).toBeInTheDocument();
    expect(screen.getByLabelText('Summary')).toHaveTextContent('6 listed (lower bound)');
  });
});

describe('untrustworthy bundles', () => {
  it('shows a tampered image as unusable evidence and counts its comparison as unknown', async () => {
    const projection = makeProjection();
    const tampered = collectArtifactRefs(projection).find((artifact) => artifact.path.endsWith('hero.phone-chrome.png'))?.path ?? '';
    const catalog = await makeCatalog([{ id: 'docs-site', projection, damage: (directory) => overwrite(directory, tampered, new Uint8Array([0, 0, 0])) }]);
    renderApp(catalog, subjectPath);

    expect(await screen.findByRole('alert')).toHaveTextContent('Some evidence in this bundle is unusable (1)');
    expect(screen.getByRole('alert')).toHaveTextContent(tampered);
    expect(screen.getByText('Evidence invalid')).toBeInTheDocument();
    // hero.phone was the only failure. With its evidence unusable nothing fails and the item reads as unknown.
    expect(screen.getByLabelText('Summary')).toHaveTextContent('1 proven · 0 failing');
    expect(screen.getByRole('link', { name: /hero\.phone, chrome: Unknown: evidence unusable/ })).toBeInTheDocument();
    expect(screen.queryByText('Evidence current')).not.toBeInTheDocument();
  });

  it('refuses to show a bundle whose manifest was edited, with no fallback to another', async () => {
    const catalog = await makeCatalog([
      { id: 'good', projection: makeProjection() },
      {
        id: 'edited',
        projection: makeProjection(),
        damage: async (directory) => {
          const { readFile } = await import('node:fs/promises');
          const manifest = JSON.parse(await readFile(`${directory}/manifest.json`, 'utf8')) as { files: Array<{ path: string; sha256: string }> };
          manifest.files[0]!.sha256 = 'f'.repeat(64);
          await overwrite(directory, 'manifest.json', JSON.stringify(manifest));
        }
      }
    ]);
    renderApp(catalog, '/bundles/edited');

    expect(await screen.findByText('This bundle is invalid and cannot be shown')).toBeInTheDocument();
    expect(screen.getByText(/bundle hash does not match/)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1, name: 'pricing' })).not.toBeInTheDocument();
  });

  it('says so when a bundle cannot be found', async () => {
    const catalog = await makeCatalog([{ id: 'docs-site', projection: makeProjection() }]);
    renderApp(catalog, '/bundles/not-there');

    expect(await screen.findByText('This bundle is invalid and cannot be shown')).toBeInTheDocument();
    expect(screen.getByText('the bundle has no manifest.json')).toBeInTheDocument();
  });
});

describe('the bundle list', () => {
  it('lists each bundle with its counts and marks a rejected one', async () => {
    const catalog = await makeCatalog([
      { id: 'docs-site', projection: makeProjection() },
      {
        id: 'broken',
        projection: makeProjection(),
        damage: (directory) => overwrite(directory, 'manifest.json', '{ not json')
      }
    ]);
    renderApp(catalog, '/');

    const good = await screen.findByRole('row', { name: /Docs site/ });
    expect(within(good).getByText('2.4.0 · build 1')).toBeInTheDocument();
    expect(good).toHaveTextContent('Offline bundle');
    expect(good).toHaveTextContent('6');
    const broken = screen.getByRole('row', { name: /broken/ });
    expect(broken).toHaveTextContent('Bundle rejected');
  });
});
