import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { makeArchiveSummary, makeCatalog, makeInspectorProjection, makeProjection, makeReleasePair } from './helpers/test-bundles';
import { renderApp } from './helpers/render-app';

describe('page titles', () => {
  const titleAt = async (path: string, ready: () => Promise<unknown>, bundles = [{ id: 'docs-site', projection: makeProjection() }]): Promise<string> => {
    renderApp(await makeCatalog(bundles), path);
    await ready();
    return document.title;
  };

  it('name the release on its overview', async () => {
    expect(await titleAt('/bundles/docs-site', () => screen.findByRole('heading', { name: 'Release status' }))).toBe('Docs site 2.4.0 · Reflection');
  });

  it('put the newest place first, so a tab or a history entry says where it is', async () => {
    expect(await titleAt('/bundles/docs-site/pages/pricing', () => screen.findByRole('heading', { level: 1, name: 'pricing' }))).toBe('pricing · Pages · Docs site 2.4.0 · Reflection');
  });

  it('say which comparison, and which page', async () => {
    const title = await titleAt('/bundles/inspect/components/button/comparisons/btn.primary%2Freact', () => screen.findByRole('heading', { level: 1, name: 'primary default · react' }), [{ id: 'inspect', projection: makeInspectorProjection() }]);

    expect(title).toBe('primary default · react · button · Components · Inspector fixture 2.4.0 · Reflection');
  });

  it('are set for the list, changes, a summary and a refused bundle', async () => {
    expect(await titleAt('/', () => screen.findByRole('heading', { name: 'Bundles' }))).toBe('Bundles · Reflection');
    expect(await titleAt('/bundles/docs-site/changes', () => screen.findByRole('heading', { level: 1, name: /Changes in/ }))).toBe('Changes · Docs site 2.4.0 · Reflection');
    expect(await titleAt('/bundles/nothing', () => screen.findByText('This bundle is invalid and cannot be shown'))).toBe('nothing · Reflection');
  });

  it('say the release is a summary on its summary page', async () => {
    const { current } = makeReleasePair();
    renderApp(await makeCatalog([current], { archive: [makeArchiveSummary({ project: 'marwes-like' })] }), '/archive/marwes-like/2.2.0');
    await screen.findByText('Summary only');

    // The project's name arrives with the history, so the title settles a moment after the page.
    await waitFor(() => expect(document.title).toBe('2.2.0 (summary only) · Components · Reflection'));
  });
});

describe('focus after moving to another page', () => {
  it('goes to the page content, and stays put when only a filter or mode changes', async () => {
    const router = renderApp(await makeCatalog([{ id: 'docs-site', projection: makeProjection() }]), '/bundles/docs-site');
    await screen.findByRole('heading', { name: 'Release status' });
    expect(document.activeElement?.tagName).not.toBe('MAIN');

    router.history.push('/bundles/docs-site/changes');
    await waitFor(() => expect(document.activeElement?.tagName).toBe('MAIN'));

    screen.getByRole('link', { name: 'Overview' }).focus();
    router.history.push('/bundles/docs-site/changes?kind=added');
    await userEvent.tab();
    expect(document.activeElement?.tagName).not.toBe('MAIN');
  });
});

describe('what a screen reader hears', () => {
  it('hides decorative status shapes and never exposes an image with no name', async () => {
    renderApp(await makeCatalog([{ id: 'inspect', projection: makeInspectorProjection() }]), '/bundles/inspect/components/button/comparisons/btn.primary%2Freact?mode=overlay');
    await screen.findByRole('heading', { level: 1, name: 'primary default · react' });

    expect(document.querySelectorAll('[role="img"][aria-label=""]')).toHaveLength(0);
    expect(document.querySelectorAll('svg[aria-hidden="true"]').length).toBeGreaterThan(0);
  });

  it('keeps a named status shape that stands alone', async () => {
    renderApp(await makeCatalog([{ id: 'docs-site', projection: makeProjection() }]), '/bundles/docs-site/pages/pricing?view=items&density=status-only');
    await screen.findByRole('heading', { level: 1, name: 'pricing' });

    expect(screen.getByRole('link', { name: 'hero.phone, chrome: Failed' }).querySelector('svg[role="img"][aria-label="Failed"]')).not.toBeNull();
  });

  it('announces a changed count and a new position without moving focus', async () => {
    renderApp(await makeCatalog([{ id: 'docs-site', projection: makeProjection() }]), '/bundles/docs-site/pages/pricing?view=items');
    await screen.findByRole('heading', { level: 1, name: 'pricing' });
    expect(screen.getByText('6 items').getAttribute('aria-live')).toBe('polite');

    renderApp(await makeCatalog([{ id: 'inspect', projection: makeInspectorProjection() }]), '/bundles/inspect/components/button/comparisons/btn.primary%2Freact');
    expect((await screen.findByText('1 of 4')).getAttribute('aria-live')).toBe('polite');
  });

  it('gives the evidence summary a role, so its name is announced', async () => {
    renderApp(await makeCatalog([{ id: 'docs-site', projection: makeProjection() }]), '/bundles/docs-site/pages/pricing');
    await screen.findByRole('heading', { level: 1, name: 'pricing' });

    expect(screen.getByRole('group', { name: 'Summary' })).toBeInTheDocument();
    expect(screen.getByLabelText('Required items')).toBeInTheDocument();
  });
});
