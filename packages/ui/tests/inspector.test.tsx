import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeCatalog, makeInspectorProjection, overwrite } from './helpers/test-bundles';
import { renderApp } from './helpers/render-app';

const base = '/bundles/inspect/components/button/comparisons';
const failing = `${base}/${encodeURIComponent('btn.primary/react')}`;

async function openInspector(path = failing, projection = makeInspectorProjection(), damage?: (directory: string) => Promise<void>): Promise<void> {
  const catalog = await makeCatalog([{ id: 'inspect', projection, ...(damage ? { damage } : {}) }]);
  renderApp(catalog, path);
  await screen.findByRole('heading', { level: 1 });
}

afterEach(() => vi.unstubAllGlobals());

describe('the comparison inspector', () => {
  it('names the comparison, its outcome and where it came from', async () => {
    await openInspector();

    expect(screen.getByRole('heading', { level: 1, name: 'primary default · react' })).toBeInTheDocument();
    const facts = within(screen.getByLabelText('Recorded facts'));
    expect(facts.getByText('1440x900')).toBeInTheDocument();
    expect(facts.getByText('16 Oct 2026 · reflection-check 0.6.0')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '← Back to button' })).toHaveAttribute('href', '#/bundles/inspect/components/button');
  });

  it('shows reference, implementation and the recorded difference side by side by default', async () => {
    await openInspector();

    const stage = within(screen.getByLabelText('Reference, implementation and difference'));
    expect(stage.getByRole('group', { name: 'Reference' })).toBeInTheDocument();
    expect(stage.getByRole('group', { name: 'Implementation' })).toBeInTheDocument();
    expect(stage.getByRole('group', { name: 'Difference' })).toBeInTheDocument();
    expect(await stage.findByAltText('Difference')).toBeInTheDocument();
  });

  it('says when no difference was recorded instead of drawing one', async () => {
    await openInspector(`${base}/${encodeURIComponent('btn.primary/vue')}`);

    const stage = within(screen.getByLabelText('Reference, implementation and difference'));
    expect(stage.getByText('No diff recorded')).toBeInTheDocument();
    expect(stage.getByText('This comparison recorded no difference image and no pixel metric.')).toBeInTheDocument();
  });

  it('says there is no reference, with the reason, and does not invent one', async () => {
    await openInspector(`${base}/${encodeURIComponent('btn.ghost/react')}`);

    const stage = within(screen.getByLabelText('Reference, implementation and difference'));
    expect(stage.getByText('No reference image')).toBeInTheDocument();
    expect(stage.queryByAltText('Reference')).not.toBeInTheDocument();
  });

  it('shows an unusable image as unusable and never as an image', async () => {
    await openInspector(failing, makeInspectorProjection(), (directory) => overwrite(directory, 'artifacts/primary-react.png', new Uint8Array([0])));

    const implementation = within(screen.getByRole('group', { name: 'Implementation' }));
    expect(await implementation.findByText('File unusable')).toBeInTheDocument();
    expect(screen.queryByAltText('Implementation')).not.toBeInTheDocument();
  });

  it('offers to download each original that is usable', async () => {
    await openInspector();

    expect(await screen.findByLabelText('Download original reference')).toHaveAttribute('download', 'primary-reference.png');
  });
});

describe('modes, zoom and the address', () => {
  const pressed = (name: string): string | null => screen.getByRole('button', { name }).getAttribute('aria-pressed');

  it('switches mode with the buttons and with the keys 1 to 4', async () => {
    await openInspector();
    expect(pressed('Side by side')).toBe('true');

    await userEvent.click(screen.getByRole('button', { name: 'Overlay' }));
    await waitFor(() => expect(pressed('Overlay')).toBe('true'));
    expect(screen.getByLabelText('Implementation opacity')).toBeInTheDocument();

    await userEvent.keyboard('3');
    await waitFor(() => expect(pressed('Wipe')).toBe('true'));
    expect(screen.getByLabelText('Wipe position')).toBeInTheDocument();

    await userEvent.keyboard('4');
    await waitFor(() => expect(pressed('Diff')).toBe('true'));
    expect(within(screen.getByRole('group', { name: 'Difference' })).queryByText('No diff recorded')).not.toBeInTheDocument();

    await userEvent.keyboard('1');
    await waitFor(() => expect(pressed('Side by side')).toBe('true'));
  });

  it('does not switch mode while typing in a control', async () => {
    await openInspector(`${failing}?mode=overlay`);

    await userEvent.type(screen.getByLabelText('Implementation opacity'), '3');

    expect(pressed('Overlay')).toBe('true');
  });

  it('reads mode, zoom and checkerboard from the address', async () => {
    await openInspector(`${failing}?mode=wipe&zoom=200&checker=1`);

    expect(pressed('Wipe')).toBe('true');
    expect(pressed('200%')).toBe('true');
    expect(pressed('Checkerboard')).toBe('true');
  });

  it('falls back to defaults for a hand-edited address', async () => {
    await openInspector(`${failing}?mode=sideways&zoom=17`);

    expect(pressed('Side by side')).toBe('true');
    expect(pressed('Fit')).toBe('true');
  });

  it('shows diff mode with the recorded image, and says so when none was recorded', async () => {
    await openInspector(`${base}/${encodeURIComponent('btn.primary/vue')}?mode=diff`);

    expect(screen.getByText('No diff recorded')).toBeInTheDocument();
  });

  it('needs both images for overlay and wipe, and says which is missing', async () => {
    await openInspector(`${base}/${encodeURIComponent('btn.ghost/react')}?mode=overlay`);

    expect(screen.getByText('Overlay needs both images')).toBeInTheDocument();
  });

  it('turns blinking off when reduced motion is requested', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce'), media: query, addEventListener: () => undefined, removeEventListener: () => undefined }));
    await openInspector(`${failing}?mode=overlay`);

    expect(screen.getByRole('button', { name: 'Blink' })).toBeDisabled();
  });

  it('shows no threshold control: the threshold is a recorded fact', async () => {
    await openInspector(`${failing}?mode=overlay`);

    expect(screen.queryByLabelText(/threshold/i, { selector: 'input' })).not.toBeInTheDocument();
    expect(within(screen.getByLabelText('Measurements')).getByText('ratio 0.001')).toBeInTheDocument();
  });
});

describe('different sizes', () => {
  it('says so, and says nothing was scaled to hide it', async () => {
    await openInspector(`${base}/${encodeURIComponent('btn.secondary/react')}`);

    expect(await screen.findByText(/The reference is 400 × 200 and the implementation is 380 × 200/)).toBeInTheDocument();
    expect(screen.getByText(/nothing is scaled to hide it/)).toBeInTheDocument();
  });

  it('says nothing when the sizes agree', async () => {
    await openInspector();

    expect(screen.queryByText(/nothing is scaled to hide it/)).not.toBeInTheDocument();
  });
});

describe('the rail and the panels below', () => {
  it('lists failing measurements first with one sentence, and folds the ones that passed', async () => {
    await openInspector();

    const measurements = within(screen.getByLabelText('Measurements'));
    expect(measurements.getByText('label padding-x: the design says 16px, the implementation has 14px (-2px).')).toBeInTheDocument();
    expect(measurements.getByText(/label padding-x: expected 16px, actual 14px, -2px, tolerance 0.5px/)).toBeInTheDocument();
    expect(measurements.getByText('2 passed')).toBeInTheDocument();
  });

  it('says "Not recorded" when there are no measurements', async () => {
    await openInspector(`${base}/${encodeURIComponent('btn.primary/vue')}`);

    expect(within(screen.getByLabelText('Measurements')).getByText('Detailed measurements: Not recorded.')).toBeInTheDocument();
  });

  it('says the result is as recorded and that freshness cannot be rechecked offline', async () => {
    await openInspector();

    const result = within(screen.getByLabelText('Verification result'));
    expect(result.getByText(/Freshness cannot be rechecked offline/)).toBeInTheDocument();
    expect(result.getByText('Not verified')).toBeInTheDocument();
    expect(result.getByText('fail / blocking / measurement')).toBeInTheDocument();
  });

  it('lists provenance, gaps and related implementations', async () => {
    await openInspector();

    const provenance = within(screen.getByLabelText('Provenance'));
    expect(provenance.getByText('chromium 140')).toBeInTheDocument();
    expect(provenance.getByText('c'.repeat(64))).toBeInTheDocument();
    expect(within(screen.getByLabelText('Gaps')).getByText('Hover styles are not captured')).toBeInTheDocument();
    const related = within(screen.getByLabelText('Related'));
    expect(related.getByRole('link', { name: 'vue' })).toHaveAttribute('href', `#${base}/${encodeURIComponent('btn.primary/vue')}`);
  });

  it('warns about an approval recorded by an agent, in the strip and in the rail, never as a pass', async () => {
    const projection = makeInspectorProjection();
    const first = projection.comparisons[0];
    if (first?.reference) first.reference.approval = { state: 'holds', attestation: 'agent', by: 'script', at: '2026-10-14T09:00:00.000Z' };
    await openInspector(failing, projection);

    expect(within(screen.getByLabelText('Recorded facts')).getByText('▲ Not confirmed by a person')).toBeInTheDocument();
    expect(within(screen.getByLabelText('Reference provenance')).getByText(/recorded by an agent/)).toBeInTheDocument();
  });
});

describe('moving between comparisons', () => {
  it('shows the position and links to the neighbours, and disables a missing one', async () => {
    await openInspector();

    const pager = within(screen.getByRole('navigation', { name: 'Move between comparisons' }));
    expect(pager.getByText('1 of 4')).toBeInTheDocument();
    expect(pager.getByText('Previous')).toHaveAttribute('aria-disabled', 'true');
    expect(pager.getByRole('link', { name: 'Next' })).toBeInTheDocument();
  });

  it('moves on with j and back with k', async () => {
    await openInspector();

    await userEvent.keyboard('j');
    await waitFor(() => expect(screen.getByText('2 of 4')).toBeInTheDocument());

    await userEvent.keyboard('k');
    await waitFor(() => expect(screen.getByText('1 of 4')).toBeInTheDocument());
  });

  it('follows the filters of the page it came from', async () => {
    await openInspector(`${failing}?outcome=failed`);

    const pager = within(screen.getByRole('navigation', { name: 'Move between comparisons' }));
    expect(pager.getByText('1 of 1')).toBeInTheDocument();
    expect(pager.getByText('Next')).toHaveAttribute('aria-disabled', 'true');
  });

  it('carries the filters and the view in the links it offers', async () => {
    await openInspector(`${failing}?q=default&mode=overlay`);

    const next = within(screen.getByRole('navigation', { name: 'Move between comparisons' })).getByRole('link', { name: 'Next' });
    expect(next.getAttribute('href')).toContain('q=default');
    expect(next.getAttribute('href')).toContain('mode=overlay');
  });
});

describe('addresses that do not match', () => {
  it('says so for a comparison that does not exist', async () => {
    const catalog = await makeCatalog([{ id: 'inspect', projection: makeInspectorProjection() }]);
    renderApp(catalog, `${base}/nope`);

    expect(await screen.findByText(/No comparison called “nope” in this bundle/)).toBeInTheDocument();
  });

  it('sends a comparison opened under another subject to its own', async () => {
    await openInspector('/bundles/inspect/pages/elsewhere/comparisons/' + encodeURIComponent('btn.primary/react'));

    expect(await screen.findByRole('heading', { level: 1, name: 'primary default · react' })).toBeInTheDocument();
  });
});

describe('links into the inspector', () => {
  it('the matrix opens the comparison with its filters', async () => {
    const catalog = await makeCatalog([{ id: 'inspect', projection: makeInspectorProjection() }]);
    renderApp(catalog, '/bundles/inspect/components/button?view=items&q=primary');
    await screen.findByRole('heading', { level: 1, name: 'button' });

    const cell = await screen.findByRole('link', { name: /primary default, react: Failed/ });

    expect(cell.getAttribute('href')).toContain('comparisons/btn.primary%2Freact');
    expect(cell.getAttribute('href')).toContain('q=primary');
  });

});
