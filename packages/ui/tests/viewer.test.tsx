import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { collectArtifactRefs } from 'reflection-projection';
import { makeCatalog, makeProjection, overwrite } from './helpers/test-bundles';
import { renderApp } from './helpers/render-app';

// These tests are about the full inventory, so they open the "All required items" view.
const subjectPath = '/bundles/docs-site/pages/pricing?view=items';

// A number from one of the summary panels, by panel and label.
function stat(panel: 'Required items' | 'Comparisons', label: string): string {
  const term = within(screen.getByLabelText(panel)).getByText(label, { selector: 'dt' });
  return term.parentElement?.querySelector('dd')?.textContent ?? '';
}

async function openSubject(path = subjectPath): Promise<void> {
  const catalog = await makeCatalog([{ id: 'docs-site', projection: makeProjection() }]);
  renderApp(catalog, path);
  await screen.findByRole('heading', { level: 1, name: 'pricing' });
}

describe('the subject page', () => {
  it('shows required items and comparisons as separate groups, from the shared counts', async () => {
    await openSubject();

    expect(['Required', 'Proven', 'Failing', 'Needs design', 'Not enrolled', 'Not proven'].map((label) => stat('Required items', label))).toEqual(['6', '1', '1', '1', '1', '2']);
    expect(['Executed', 'Passed', 'Failed', 'Not run'].map((label) => stat('Comparisons', label))).toEqual(['5', '4', '1', '1']);
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

  it('says what the shared reference is once, in the column header, and not on every row', async () => {
    await openSubject();

    const header = screen.getByRole('columnheader', { name: /Reference/ });
    expect(header).toHaveTextContent('Reference screenshots · approved by a person');
    const row = screen.getByRole('row', { name: /hero\.desktop/ });
    expect(within(row).queryByText('Reference screenshots')).not.toBeInTheDocument();
    expect(within(row).getByLabelText('Reference screenshots · approved by a person')).toBeInTheDocument();
  });

  it('spells out a row whose reference differs from the shared one', async () => {
    await openSubject();

    const row = screen.getByRole('row', { name: /banner\.desktop/ });
    // banner.desktop has no comparison and no design record, so nothing is known about its reference.
    expect(within(row).getByText('Unknown')).toBeInTheDocument();
  });

  it('never shows a pass or fail for a reference', async () => {
    await openSubject();

    const header = screen.getByRole('columnheader', { name: /Reference/ });
    expect(header).not.toHaveTextContent(/pass|fail/i);
  });

  it('links a cell to its comparison and says what it holds', async () => {
    await openSubject();

    const failedCell = screen.getByRole('link', { name: 'hero.phone, chrome: Failed' });

    expect(failedCell).toHaveAttribute('href', '#/bundles/docs-site/pages/pricing/comparisons/hero.phone%2Fchrome');
  });

  it('says where the proof came from, with its own date', async () => {
    await openSubject();

    const provenance = screen.getByLabelText('Provenance');
    expect(within(provenance).getByText('Proof based on')).toBeInTheDocument();
    expect(within(provenance).getByText('Reference screenshots, captured 14 Oct 2026')).toBeInTheDocument();
    expect(within(provenance).getByText('15 Oct 2026 · screenshot-compare 2.1.0')).toBeInTheDocument();
  });

  it('reads a sound bundle as offline and never as current', async () => {
    await openSubject();

    expect(await screen.findByText(/Offline bundle · freshness not verified/)).toBeInTheDocument();
    expect(screen.queryByText(/Evidence current/)).not.toBeInTheDocument();
  });

  it('filters from the address and keeps the totals visible', async () => {
    await openSubject(`${subjectPath}&q=phone`);

    expect(screen.getByText('Showing 1 of 6 items')).toBeInTheDocument();
    expect(screen.getByText('hero.phone')).toBeInTheDocument();
    expect(screen.queryByText('hero.desktop')).not.toBeInTheDocument();
    expect(stat('Required items', 'Required')).toBe('6');
  });

  it('removes an outcome filter with its chip', async () => {
    await openSubject(`${subjectPath}&outcome=failed`);
    expect(screen.queryByText('hero.desktop')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Remove filter Failed' }));

    await waitFor(() => expect(screen.getByRole('button', { name: /Passed/ })).toBeInTheDocument());
  });

  it('explains an empty result and offers to clear the filters', async () => {
    await openSubject(`${subjectPath}&q=nothing-matches-this`);

    expect(screen.getByText('No items match these filters.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    await waitFor(() => expect(screen.getByText('hero.phone')).toBeInTheDocument());
  });

  it('shows only a glyph per cell in status-only density, still named for assistive technology', async () => {
    await openSubject(`${subjectPath}&density=status-only`);

    const cell = screen.getByRole('link', { name: 'hero.phone, chrome: Failed' });
    // The only text is the glyph's own name; there is no visible label beside it.
    expect(cell.textContent).toBe('Failed');
    expect(within(cell).getByRole('img', { name: 'Failed' })).toBeInTheDocument();
  });

  it('says so when the subject is not in the bundle', async () => {
    const catalog = await makeCatalog([{ id: 'docs-site', projection: makeProjection() }]);
    renderApp(catalog, '/bundles/docs-site/pages/nothing');

    expect(await screen.findByText(/No subject called “nothing” in this bundle/)).toBeInTheDocument();
  });
});

describe('a reference nobody confirmed', () => {
  it('warns in the header when every approval was recorded by an agent', async () => {
    const projection = makeProjection();
    for (const entry of projection.comparisons) {
      if (entry.reference) entry.reference.approval = { state: 'holds', attestation: 'agent', by: 'import-script', at: '2026-10-14T09:00:00.000Z' };
    }
    const catalog = await makeCatalog([{ id: 'docs-site', projection }]);
    renderApp(catalog, subjectPath);

    const header = await screen.findByRole('columnheader', { name: /Reference/ });
    expect(header).toHaveTextContent('▲ Reference screenshots · recorded by an agent');
  });
});

describe('counts a provider cannot give', () => {
  it('shows an unknown bucket as unknown, never as 0', async () => {
    const projection = makeProjection({ provider: { name: 'p', readinessConcepts: { needsDesign: false, notEnrolled: false }, capabilities: [] } });
    const catalog = await makeCatalog([{ id: 'docs-site', projection }]);
    renderApp(catalog, subjectPath);
    await screen.findByRole('heading', { level: 1, name: 'pricing' });

    expect(stat('Required items', 'Needs design')).toBe('Unknown');
    expect(stat('Required items', 'Not enrolled')).toBe('Unknown');
    expect(stat('Required items', 'Proven')).toBe('1');
  });

  it('warns that the count is a lower bound when only what ran is listed', async () => {
    const catalog = await makeCatalog([{ id: 'docs-site', projection: makeProjection({ inventory: 'executed-only' }) }]);
    renderApp(catalog, subjectPath);

    expect(await screen.findByText('Only checks that ran are listed')).toBeInTheDocument();
    expect(stat('Required items', 'Listed (lower bound)')).toBe('6');
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
    expect([stat('Required items', 'Proven'), stat('Required items', 'Failing')]).toEqual(['1', '0']);
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
