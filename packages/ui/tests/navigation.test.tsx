import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { collectArtifactRefs, projectionSchema, type Projection } from 'reflection-projection';
import { makeCatalog, makeProjection, overwrite } from './helpers/test-bundles';
import { renderApp } from './helpers/render-app';

// A release with two components and one page, so the sidebar has both sections to show.
function makeRelease(): Projection {
  const base = makeProjection();
  const componentRequirement = (id: string, subject: string) => ({ id, label: id, subject: { kind: 'component' as const, id: subject, variant: 'primary' }, requiredProofs: ['visual' as const], enrolled: true });
  const componentComparison = (requirementId: string, subject: string) => ({
    id: `${requirementId}/react`,
    requirementId,
    subject: { kind: 'component' as const, id: subject, adapter: 'react' },
    runId: 'run-1',
    actual: { role: 'actual' as const, path: `artifacts/${requirementId}-react.png` },
    proof: { visual: 'passed' as const },
    verdict: { status: 'pass' as const, severity: 'review' as const }
  });
  return projectionSchema.parse({
    ...base,
    requirements: [...base.requirements, componentRequirement('button.primary', 'button'), componentRequirement('input.default', 'input')],
    comparisons: [...base.comparisons, componentComparison('button.primary', 'button'), componentComparison('input.default', 'input')]
  });
}

async function openRelease(path: string): Promise<void> {
  const catalog = await makeCatalog([
    { id: 'docs-site', projection: makeRelease() },
    { id: 'other-release', projection: makeProjection() }
  ]);
  renderApp(catalog, path);
  await screen.findByRole('navigation', { name: 'Release navigation' });
}

const sidebar = () => within(screen.getByRole('navigation', { name: 'Release navigation' }));

describe('the release-first shell', () => {
  it('shows the release first, above the navigation, with its state', async () => {
    await openRelease('/bundles/docs-site');

    const release = sidebar().getByText('Docs site');
    expect(release).toBeInTheDocument();
    expect(sidebar().getByText(/2\.4\.0 · build 1/)).toBeInTheDocument();
    expect(sidebar().getByText('Candidate')).toBeInTheDocument();
  });

  it('offers the other releases and moves to the one chosen', async () => {
    await openRelease('/bundles/docs-site');

    await userEvent.selectOptions(await sidebar().findByLabelText('Change release'), 'other-release');

    await waitFor(() => expect(screen.getByRole('link', { name: 'Overview' })).toHaveAttribute('href', '#/bundles/other-release'));
  });

  it('has one logical sidebar: Overview, Changes, Components, Pages, Design references', async () => {
    await openRelease('/bundles/docs-site');

    expect(sidebar().getByRole('link', { name: 'Overview' })).toHaveAttribute('aria-current', 'page');
    expect(sidebar().getByRole('link', { name: 'Changes' })).toBeInTheDocument();
    expect(sidebar().getByRole('button', { name: /Components/ })).toBeInTheDocument();
    expect(sidebar().getByRole('button', { name: /Pages/ })).toBeInTheDocument();
    expect(sidebar().getByText('Design references')).toHaveAttribute('aria-disabled', 'true');
  });

  it('keeps both lists closed on the overview and opens the section of the current subject', async () => {
    await openRelease('/bundles/docs-site');
    expect(sidebar().getByRole('button', { name: /Components/ })).toHaveAttribute('aria-expanded', 'false');
  });

  it('opens the section a subject lives in and marks it as the current page', async () => {
    await openRelease('/bundles/docs-site/pages/pricing');

    expect(sidebar().getByRole('button', { name: /Pages/ })).toHaveAttribute('aria-expanded', 'true');
    expect(sidebar().getByRole('button', { name: /Components/ })).toHaveAttribute('aria-expanded', 'false');
    expect(sidebar().getByRole('link', { name: 'pricing' })).toHaveAttribute('aria-current', 'page');
  });

  it('puts search inside its section and only while the section is open', async () => {
    await openRelease('/bundles/docs-site');
    expect(sidebar().queryByLabelText('Search components')).not.toBeInTheDocument();

    await userEvent.click(sidebar().getByRole('button', { name: /Components/ }));
    await userEvent.type(sidebar().getByLabelText('Search components'), 'inp');

    expect(sidebar().getByRole('link', { name: 'input' })).toBeInTheDocument();
    expect(sidebar().queryByRole('link', { name: 'button' })).not.toBeInTheDocument();
  });

  it('says so when a search matches nothing', async () => {
    await openRelease('/bundles/docs-site');
    await userEvent.click(sidebar().getByRole('button', { name: /Components/ }));

    await userEvent.type(sidebar().getByLabelText('Search components'), 'zzz');

    expect(sidebar().getByText('No components match.')).toBeInTheDocument();
  });

  it('links each subject to the section its kind belongs to', async () => {
    await openRelease('/bundles/docs-site');
    await userEvent.click(sidebar().getByRole('button', { name: /Components/ }));
    await userEvent.click(sidebar().getByRole('button', { name: /Pages/ }));

    expect(sidebar().getByRole('link', { name: 'button' })).toHaveAttribute('href', '#/bundles/docs-site/components/button');
    expect(sidebar().getByRole('link', { name: 'pricing' })).toHaveAttribute('href', '#/bundles/docs-site/pages/pricing');
  });

  it('sends a page opened under components to where it lives', async () => {
    await openRelease('/bundles/docs-site/components/pricing');

    expect(await screen.findByRole('heading', { level: 1, name: 'pricing' })).toBeInTheDocument();
    expect(sidebar().getByRole('button', { name: /Pages/ })).toHaveAttribute('aria-expanded', 'true');
  });

  it('shows the breadcrumb with the release, the section and the subject', async () => {
    await openRelease('/bundles/docs-site/components/button');

    const crumbs = within(screen.getByRole('navigation', { name: 'Breadcrumb' }));
    expect(crumbs.getByRole('link', { name: 'Docs site 2.4.0' })).toHaveAttribute('href', '#/bundles/docs-site');
    expect(crumbs.getByText('Components')).toBeInTheDocument();
    expect(crumbs.getByText('button')).toBeInTheDocument();
  });
});

describe('the release overview', () => {
  it('counts the whole release once, in two panels, and lists every subject by section', async () => {
    await openRelease('/bundles/docs-site');

    const required = within(screen.getByLabelText('Required items'));
    // Six items on the page plus one each for the two components.
    expect(required.getByText('Required', { selector: 'dt' }).parentElement).toHaveTextContent('8');
    expect(screen.getByRole('heading', { name: 'Components (2)' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Pages (1)' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /pricing/ })).toHaveAttribute('href', '#/bundles/docs-site/pages/pricing');
  });

  it('lists each design source with its own date', async () => {
    await openRelease('/bundles/docs-site');

    expect(within(screen.getByLabelText('Provenance')).getByText('Reference screenshots, captured 14 Oct 2026')).toBeInTheDocument();
  });
});

describe('the changes page', () => {
  it('says changes are not available rather than showing nothing', async () => {
    await openRelease('/bundles/docs-site/changes');

    expect(await screen.findByText('Release changes are not available yet')).toBeInTheDocument();
    expect(sidebar().getByRole('link', { name: 'Changes' })).toHaveAttribute('aria-current', 'page');
  });
});

describe('the evidence state on every route', () => {
  it.each([
    ['the overview', '/bundles/docs-site'],
    ['the changes page', '/bundles/docs-site/changes'],
    ['a subject', '/bundles/docs-site/pages/pricing']
  ])('shows the offline label on %s and never "current"', async (_name, path) => {
    await openRelease(path);

    expect(await screen.findByText(/Offline bundle · freshness not verified/)).toBeInTheDocument();
    expect(screen.queryByText('Evidence current')).not.toBeInTheDocument();
  });

  it('shows invalid evidence on a route that is not the subject page', async () => {
    const projection = makeRelease();
    const tampered = collectArtifactRefs(projection)[0]?.path ?? '';
    const catalog = await makeCatalog([{ id: 'docs-site', projection, damage: (directory) => overwrite(directory, tampered, new Uint8Array([0])) }]);
    renderApp(catalog, '/bundles/docs-site/changes');

    expect(await screen.findByText('Evidence invalid')).toBeInTheDocument();
  });
});
