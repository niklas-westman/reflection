import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { makeCatalog, makeComponentProjection, makeProjection, overwrite } from './helpers/test-bundles';
import { renderApp } from './helpers/render-app';

const buttonPath = '/bundles/components/components/button';

async function openButton(path = buttonPath, projection = makeComponentProjection()): Promise<void> {
  const catalog = await makeCatalog([{ id: 'components', projection }]);
  renderApp(catalog, path);
  await screen.findByRole('heading', { level: 1, name: 'button' });
}

const cards = () => within(screen.getByLabelText('Reference and implementations'));

describe('the component gallery', () => {
  it('opens on the item that most needs attention, with the reference and one card per implementation', async () => {
    await openButton();

    expect(screen.getByLabelText('Required item')).toHaveValue('button.primary.hover.light');
    expect(cards().getAllByRole('article').map((card) => card.getAttribute('aria-label'))).toEqual(['Reference', 'react', 'svelte', 'vue']);
  });

  it('gives each implementation its own result, and links a recorded one to its comparison', async () => {
    await openButton();

    const react = within(cards().getByLabelText('react'));
    expect(react.getByText('Failed')).toBeInTheDocument();
    expect(react.getByRole('link', { name: 'Open comparison' })).toHaveAttribute('href', '#/bundles/components/components/button/comparisons/button.primary.hover.light%2Freact');
    expect(within(cards().getByLabelText('vue')).getByText('Passed')).toBeInTheDocument();
  });

  it('shows an implementation that was never compared as not compared, with no link and no image', async () => {
    await openButton(`${buttonPath}?item=button.secondary.default.light`);

    const vue = within(cards().getByLabelText('vue'));
    expect(vue.getByText('Not compared', { selector: 'span span, span' })).toBeInTheDocument();
    expect(vue.getByText('No comparison recorded for this item')).toBeInTheDocument();
    expect(vue.queryByRole('link')).not.toBeInTheDocument();
  });

  it('describes the reference by availability, source, date and approval, never by a result', async () => {
    await openButton();

    const card = cards().getByLabelText('Reference');
    const reference = within(card);
    expect(reference.getByText('Available')).toBeInTheDocument();
    expect(reference.getByText(/Design file, captured 12 Oct 2026/)).toBeInTheDocument();
    expect(reference.getByText('Approved and recorded by a person')).toBeInTheDocument();
    expect(card).not.toHaveTextContent(/passed|failed/i);
  });

  it('warns when the reference approval was recorded by an agent', async () => {
    const projection = makeComponentProjection();
    for (const entry of projection.comparisons) {
      if (entry.reference) entry.reference.approval = { state: 'holds', attestation: 'agent', by: 'script', at: '2026-10-14T09:00:00.000Z' };
    }
    await openButton(buttonPath, projection);

    expect(within(cards().getByLabelText('Reference')).getByText("▲ Recorded by an agent, no person's words")).toBeInTheDocument();
    expect(await screen.findByText('Reference approval is not confirmed by a person')).toBeInTheDocument();
  });

  it('says there is no design to compare against, instead of showing a result', async () => {
    await openButton(`${buttonPath}?item=button.primary.default.dark`);

    const reference = within(cards().getByLabelText('Reference'));
    expect(reference.getByText('Missing')).toBeInTheDocument();
    expect(reference.getByText('No design to compare against')).toBeInTheDocument();
    expect(within(screen.getByLabelText('Verification details')).getByText('Needs design')).toBeInTheDocument();
    expect(within(screen.getByLabelText('Verification details')).getByText('No dark design exists yet')).toBeInTheDocument();
  });
});

describe('choosing the item', () => {
  it('lists the dimensions that have a choice and the item they pick', async () => {
    await openButton();

    expect(screen.getByLabelText('Variant')).toHaveValue('primary');
    expect(screen.getByLabelText('State')).toHaveValue('hover');
    expect(screen.getByLabelText('Mode')).toHaveValue('light');
  });

  it('keeps the other dimensions where it can when one changes', async () => {
    await openButton();

    await userEvent.selectOptions(screen.getByLabelText('Variant'), 'secondary');

    await waitFor(() => expect(screen.getByLabelText('Required item')).toHaveValue('button.secondary.hover.light'));
    expect(screen.getByLabelText('State')).toHaveValue('hover');
  });

  it('lands on the nearest real item when a combination does not exist', async () => {
    await openButton();

    await userEvent.selectOptions(screen.getByLabelText('Mode'), 'dark');

    await waitFor(() => expect(screen.getByLabelText('Required item')).toHaveValue('button.primary.default.dark'));
    expect(screen.getByLabelText('State')).toHaveValue('default');
  });

  it('can pick any required item directly', async () => {
    await openButton();

    await userEvent.selectOptions(screen.getByLabelText('Required item'), 'button.secondary.default.light');

    await waitFor(() => expect(screen.getByLabelText('Variant')).toHaveValue('secondary'));
  });

  it('opens the item named in the address', async () => {
    await openButton(`${buttonPath}?item=button.secondary.hover.light`);

    expect(screen.getByLabelText('Required item')).toHaveValue('button.secondary.hover.light');
  });
});

describe('choosing implementations', () => {
  it('shows only the ones chosen, and never fewer than one', async () => {
    await openButton();

    await userEvent.click(screen.getByText(/Show implementations: all \(3\)/));
    await userEvent.click(screen.getByRole('checkbox', { name: 'vue' }));
    await waitFor(() => expect(cards().getAllByRole('article').map((card) => card.getAttribute('aria-label'))).toEqual(['Reference', 'react', 'svelte']));

    await userEvent.click(screen.getByRole('checkbox', { name: 'svelte' }));
    await waitFor(() => expect(cards().getAllByRole('article').map((card) => card.getAttribute('aria-label'))).toEqual(['Reference', 'react']));
    await userEvent.click(screen.getByRole('checkbox', { name: 'react' }));

    expect(cards().getAllByRole('article').map((card) => card.getAttribute('aria-label'))).toEqual(['Reference', 'react']);
  });

  it('reads the chosen implementations from the address', async () => {
    await openButton(`${buttonPath}?adapters=svelte`);

    expect(cards().getAllByRole('article').map((card) => card.getAttribute('aria-label'))).toEqual(['Reference', 'svelte']);
    expect(screen.getByText(/Show implementations: 1 of 3/)).toBeInTheDocument();
  });

  it('works for a family with a single implementation, with no chooser and no invented cards', async () => {
    const projection = makeComponentProjection();
    projection.comparisons = projection.comparisons.filter((entry) => entry.subject.adapter === 'react');
    await openButton(buttonPath, projection);

    expect(cards().getAllByRole('article').map((card) => card.getAttribute('aria-label'))).toEqual(['Reference', 'react']);
    expect(screen.queryByText(/Show implementations/)).not.toBeInTheDocument();
  });
});

describe('verification details', () => {
  it('says the item is failing and tabulates each required proof by implementation', async () => {
    await openButton();

    const details = within(screen.getByLabelText('Verification details'));
    expect(details.getByText('Failing')).toBeInTheDocument();
    const table = within(details.getByRole('table', { name: 'Required proofs by implementation' }));
    expect(table.getByRole('row', { name: /react/ })).toHaveTextContent('react');
    expect(within(table.getByRole('row', { name: /react/ })).getAllByRole('img').map((glyph) => glyph.getAttribute('aria-label'))).toEqual(['Failed', 'Failed']);
    expect(within(table.getByRole('row', { name: /vue/ })).getAllByRole('img').map((glyph) => glyph.getAttribute('aria-label'))).toEqual(['Passed', 'Passed']);
  });

  it('says which implementations were not compared next to a status that covers only what was compared', async () => {
    await openButton(`${buttonPath}?item=button.secondary.default.light`);

    const details = within(screen.getByLabelText('Verification details'));
    expect(details.getByText('Proven')).toBeInTheDocument();
    expect(details.getByText('Not compared in: svelte, vue. The status covers only what was compared.')).toBeInTheDocument();
  });

  it('shows the threshold the comparison recorded as a fact, and says so when none was recorded', async () => {
    await openButton();
    expect(within(screen.getByLabelText('Verification details')).getByText('ratio 0.01')).toBeInTheDocument();
  });

  it('says "Not recorded" for what the comparison did not record', async () => {
    await openButton(`${buttonPath}?item=button.primary.default.light`);

    const details = within(screen.getByLabelText('Verification details'));
    expect(details.getByText('Recorded threshold').nextSibling).toHaveTextContent('Not recorded');
  });

  it('counts only this item\'s comparisons, in their own unit', async () => {
    await openButton();

    expect(within(screen.getByLabelText('Verification details')).getByText('2 of 3 executed passed')).toBeInTheDocument();
  });

  it('has no control to change the threshold', async () => {
    await openButton();

    expect(screen.queryByLabelText(/threshold/i)).not.toBeInTheDocument();
    expect(screen.queryAllByRole('slider')).toHaveLength(0);
  });
});

describe('the inline comparison', () => {
  it('starts with the failing implementation beside the reference and links to the full comparison', async () => {
    await openButton();

    const compare = within(screen.getByLabelText('Visual comparison'));
    expect(compare.getByLabelText('Implementation')).toHaveValue('react');
    expect(compare.getByRole('link', { name: 'Open full comparison' })).toHaveAttribute('href', '#/bundles/components/components/button/comparisons/button.primary.hover.light%2Freact');
  });

  it('offers overlay with an opacity control, which is not a threshold', async () => {
    await openButton();
    const compare = within(screen.getByLabelText('Visual comparison'));
    expect(compare.queryByRole('slider')).not.toBeInTheDocument();

    await userEvent.click(compare.getByRole('button', { name: 'Overlay' }));

    expect(compare.getByRole('slider', { name: 'Implementation opacity' })).toBeInTheDocument();
  });

  it('says what is missing when there is nothing to compare', async () => {
    await openButton(`${buttonPath}?item=button.primary.default.dark`);

    expect(within(screen.getByLabelText('Visual comparison')).getByText(/needs both a reference image and an implementation image/)).toBeInTheDocument();
  });
});

describe('evidence that cannot be used', () => {
  it('reads an implementation with a tampered image as unknown and withholds the image', async () => {
    const projection = makeComponentProjection();
    const catalog = await makeCatalog([{ id: 'components', projection, damage: (directory) => overwrite(directory, 'artifacts/button.primary.hover.light-react.png', new Uint8Array([0])) }]);
    renderApp(catalog, buttonPath);
    await screen.findByRole('heading', { level: 1, name: 'button' });

    await screen.findByLabelText('Reference and implementations');
    const react = within(cards().getByLabelText('react'));
    await waitFor(() => expect(react.getByText('Unknown: evidence unusable')).toBeInTheDocument());
    expect(await react.findByText('File unusable')).toBeInTheDocument();
    expect(react.queryByText('Failed')).not.toBeInTheDocument();
  });
});

describe('the views of a subject', () => {
  it('switches between the gallery and the full inventory, and Changes is not available yet', async () => {
    await openButton();
    const views = within(screen.getByRole('group', { name: 'View' }));

    expect(views.getByRole('button', { name: 'Visual gallery' })).toHaveAttribute('aria-pressed', 'true');
    expect(views.getByRole('button', { name: /^Changes on this/ })).toBeDisabled();

    await userEvent.click(views.getByRole('button', { name: 'All required items' }));

    expect(await screen.findAllByRole('rowgroup')).not.toHaveLength(0);
    expect(screen.queryByLabelText('Reference and implementations')).not.toBeInTheDocument();
  });
});

describe('the page overview', () => {
  const pagePath = '/bundles/docs-site/pages/pricing';
  async function openPage(projection = makeProjection()): Promise<void> {
    const catalog = await makeCatalog([{ id: 'docs-site', projection }]);
    renderApp(catalog, pagePath);
    await screen.findByRole('heading', { level: 1, name: 'pricing' });
  }

  it('shows recorded page checks, failures and unproven items first, and says it is a selection', async () => {
    await openPage();

    const checks = within(await screen.findByLabelText('Recorded page checks'));
    expect(checks.getAllByRole('article').map((card) => card.getAttribute('aria-label'))).toEqual(['hero.phone', 'faq.desktop', 'hero.desktop']);
    expect(screen.getByText(/Showing 3 of 6 required items, failures and unproven items first/)).toBeInTheDocument();
  });

  it('shows each implementation\'s own result on a check, never a combined one', async () => {
    await openPage();

    const check = within(await screen.findByLabelText('hero.phone'));
    expect(check.getByRole('img', { name: 'chrome: Failed' })).toBeInTheDocument();
    expect(check.getByRole('img', { name: 'firefox: Passed' })).toBeInTheDocument();
    expect(check.getByRole('link', { name: 'Open comparison' })).toHaveAttribute('href', '#/bundles/docs-site/pages/pricing/comparisons/hero.phone%2Fchrome');
  });

  it('leads to the full inventory, which still counts every item', async () => {
    await openPage();

    await userEvent.click(await screen.findByRole('button', { name: 'View all 6 required items' }));

    expect(await screen.findAllByRole('rowgroup')).not.toHaveLength(0);
    expect(screen.getByText('6 items')).toBeInTheDocument();
  });

  it('warns once that the reference approvals were not confirmed by a person', async () => {
    const projection = makeProjection();
    for (const entry of projection.comparisons) {
      if (entry.reference) entry.reference.approval = { state: 'holds', attestation: 'agent', by: 'script', at: '2026-10-14T09:00:00.000Z' };
    }
    await openPage(projection);

    expect(await screen.findAllByText('Reference approval is not confirmed by a person')).toHaveLength(1);
  });

  it('says so when no check has evidence, instead of showing empty cards', async () => {
    const projection = makeProjection();
    projection.comparisons = [];
    await openPage(projection);

    expect(await screen.findByText(/No page check has any recorded evidence yet/)).toBeInTheDocument();
  });
});
