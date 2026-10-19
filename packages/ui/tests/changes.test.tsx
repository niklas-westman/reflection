import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { projectionSchema, type Projection } from 'reflection-projection';
import { findPreviousBundle } from '../src/model/previous-release';
import { makeCatalog, makeReleasePair, type TestBundle } from './helpers/test-bundles';
import { renderApp } from './helpers/render-app';

const changesPath = '/bundles/current/changes';

async function openChanges(bundles: TestBundle[], path = changesPath): Promise<void> {
  renderApp(await makeCatalog(bundles), path);
  await screen.findByRole('heading', { level: 1, name: /Changes in/ });
}

const summary = () => within(screen.getByLabelText('Summary of changes'));
const cards = () => within(screen.getByLabelText('Changes to inspect'));

describe('the changes page', () => {
  it('says which release it compares with and counts the catalog changes in required items', async () => {
    const { previous, current } = makeReleasePair();
    await openChanges([previous, current]);

    expect(await screen.findByText('Compared with 2.3.0')).toBeInTheDocument();
    expect(within(summary().getByLabelText('Added')).getByText('2')).toBeInTheDocument();
    expect(summary().getByLabelText('Added')).toHaveTextContent('1 new subjects');
    expect(within(summary().getByLabelText('Updated')).getByText('1')).toBeInTheDocument();
    expect(summary().getByLabelText('Updated')).toHaveTextContent('1 subjects updated');
    expect(summary().getByLabelText('Removed')).toHaveTextContent('2');
    expect(summary().getByLabelText('Removed')).toHaveTextContent('1 subjects removed');
  });

  it('shows a card per changed subject, with the kind of change, and says a change is not a pass or a fail', async () => {
    const { previous, current } = makeReleasePair();
    await openChanges([previous, current]);

    expect(await screen.findByLabelText('select: added')).toBeInTheDocument();
    expect(cards().getByLabelText('button: updated')).toBeInTheDocument();
    expect(cards().getByLabelText('checkout: removed')).toBeInTheDocument();
    expect(screen.getByText(/it is not a pass or a fail/)).toBeInTheDocument();
  });

  it('shows the design reference before and after for an updated item', async () => {
    const { previous, current } = makeReleasePair();
    await openChanges([previous, current]);

    const pair = within(await screen.findByLabelText('primary default light: before and after'));
    expect(pair.getByText('2.3.0')).toBeInTheDocument();
    expect(pair.getByText('2.4.0')).toBeInTheDocument();
    expect(await pair.findByAltText('primary default light, in 2.3.0')).toBeInTheDocument();
    expect(await pair.findByAltText('primary default light, in 2.4.0')).toBeInTheDocument();
  });

  it('says plainly when an item is new or removed, instead of showing a stand-in', async () => {
    const { previous, current } = makeReleasePair();
    await openChanges([previous, current]);

    expect(within(await screen.findByLabelText('select default: before and after')).getByText('Not in the previous release')).toBeInTheDocument();
    expect(within(cards().getByLabelText('pay: before and after')).getByText('Removed from the required items')).toBeInTheDocument();
  });

  it('links a subject that still exists, and says a removed one is gone, without a link', async () => {
    const { previous, current } = makeReleasePair();
    await openChanges([previous, current]);

    expect(await screen.findByRole('link', { name: 'Inspect button' })).toHaveAttribute('href', '#/bundles/current/components/button');
    expect(within(cards().getByLabelText('checkout: removed')).getByText('No longer part of this release')).toBeInTheDocument();
    expect(within(cards().getByLabelText('checkout: removed')).queryByRole('link')).not.toBeInTheDocument();
  });

  it('filters by kind of change and by search, with counts in subjects', async () => {
    const { previous, current } = makeReleasePair();
    await openChanges([previous, current]);

    expect(await screen.findByRole('button', { name: 'All changes (3)' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Added (1)' }));
    await waitFor(() => expect(cards().queryByLabelText('button: updated')).not.toBeInTheDocument());
    expect(cards().getByLabelText('select: added')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'All changes (3)' }));
    await userEvent.type(screen.getByLabelText('Search changes'), 'legacy');
    await waitFor(() => expect(cards().getAllByRole('article')).toHaveLength(1));
    expect(cards().getByLabelText('button: updated')).toBeInTheDocument();
  });

  it('reads the filter from the address and says when nothing matches', async () => {
    const { previous, current } = makeReleasePair();
    await openChanges([previous, current], `${changesPath}?kind=added&q=nothing-like-this`);

    expect(await screen.findByText('No change matches these filters.')).toBeInTheDocument();
  });

  it('says when an image of the previous release is no longer retained', async () => {
    const { previous, current } = makeReleasePair();
    await openChanges([{ ...previous, damage: (directory) => rm(join(directory, 'artifacts/button.primary.default.light-reference.png')) }, current]);

    const pair = within(await screen.findByLabelText('primary default light: before and after'));
    expect(await pair.findByText('Image no longer retained')).toBeInTheDocument();
    expect(await pair.findByAltText('primary default light, in 2.4.0')).toBeInTheDocument();
  });

  it('shows no percentage', async () => {
    const { previous, current } = makeReleasePair();
    await openChanges([previous, current]);
    await screen.findByLabelText('select: added');

    expect(document.body.textContent).not.toContain('%');
  });

  it('says nothing changed when the two releases have the same catalog', async () => {
    const { previous, current } = makeReleasePair();
    const same: Projection = projectionSchema.parse({ ...current.projection });
    const { imageContent: _unused, ...unchangedImages } = previous;
    await openChanges([{ ...unchangedImages, projection: same }, current]);

    expect(await screen.findByText('Nothing changed in the catalog of required items or their design references.')).toBeInTheDocument();
  });
});

describe('when there is no previous release to compare with', () => {
  it('says the previous release is not available here, and still shows the stored delta when there is one', async () => {
    const { current } = makeReleasePair();
    const withDelta: Projection = projectionSchema.parse({
      ...current.projection,
      delta: { against: '2.3.0', sameSnapshot: true, regressed: [{ comparisonId: 'x' }], fixed: [], stillFailing: [], newlyEnrolled: [], newInDesign: [], stillProposed: [], removedInDesign: [], coverage: { before: null, after: { required: 6, proven: 1, failing: 1, needsDesign: 1, notEnrolled: 1, unknown: 2 } } }
    });
    await openChanges([{ ...current, projection: withDelta }]);

    expect(await screen.findByText('The previous release (2.3.0) is not available here')).toBeInTheDocument();
    expect(screen.getByLabelText('Changes since the previous release')).toBeInTheDocument();
    expect(screen.queryByLabelText('Changes to inspect')).not.toBeInTheDocument();
  });

  it('says it is the first release when none is named', async () => {
    const { previous } = makeReleasePair();
    await openChanges([previous], '/bundles/previous/changes');

    expect(await screen.findByText('This is the first release')).toBeInTheDocument();
  });
});

describe('the release overview with a previous release', () => {
  it('marks each subject with the change to its catalog, apart from its verification', async () => {
    const { previous, current } = makeReleasePair();
    renderApp(await makeCatalog([previous, current]), '/bundles/current');
    await screen.findByRole('heading', { name: 'Release status' });

    const components = within(screen.getByLabelText('Components'));
    expect(await components.findByText('Updated')).toBeInTheDocument();
    expect(components.getByText('Added')).toBeInTheDocument();
    // button has a failing item, and its badge still says only what changed in the catalog.
    expect(within(components.getByRole('link', { name: /button/ })).getByText('Updated')).toBeInTheDocument();
    expect(within(components.getByRole('link', { name: /button/ })).getByText(/1 failing/)).toBeInTheDocument();
  });

  it('adds a card of design changes, derived from the diff', async () => {
    const { previous, current } = makeReleasePair();
    renderApp(await makeCatalog([previous, current]), '/bundles/current');

    const card = within(await screen.findByLabelText('Design changes'));
    expect(card.getByText('Design changes since 2.3.0')).toBeInTheDocument();
    expect(card.getByText('Updated references').nextSibling).toHaveTextContent('1');
    expect(card.getByText('New required items').nextSibling).toHaveTextContent('2');
    expect(card.getByText('Removed required items').nextSibling).toHaveTextContent('2');
    expect(card.getByRole('link', { name: 'See the changes' })).toHaveAttribute('href', '#/bundles/current/changes');
  });

  it('shows neither badges nor the card when there is no previous release', async () => {
    const { current } = makeReleasePair();
    renderApp(await makeCatalog([current]), '/bundles/current');
    await screen.findByRole('heading', { name: 'Release status' });

    expect(screen.queryByLabelText('Design changes')).not.toBeInTheDocument();
    expect(within(screen.getByLabelText('Components')).queryByText('Updated')).not.toBeInTheDocument();
  });
});

describe('the changes view of one subject', () => {
  it('lists the changed items with their before and after, and says how many are unchanged', async () => {
    const { previous, current } = makeReleasePair();
    renderApp(await makeCatalog([previous, current]), '/bundles/current/components/button?view=changes');

    const list = within(await screen.findByLabelText('Changed required items'));
    expect(list.getByText('primary default light')).toBeInTheDocument();
    expect(list.getByText('secondary hover light')).toBeInTheDocument();
    expect(list.getByText('legacy default light')).toBeInTheDocument();
    expect(screen.getByText(/items are unchanged|item is unchanged/)).toBeInTheDocument();
  });

  it('is available as a view only when there is something to compare with', async () => {
    const { previous, current } = makeReleasePair();
    renderApp(await makeCatalog([previous, current]), '/bundles/current/components/button');
    await screen.findByRole('heading', { level: 1, name: 'button' });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Changes' })).toBeEnabled());
  });

  it('is disabled with the reason for a first release', async () => {
    const { previous } = makeReleasePair();
    renderApp(await makeCatalog([previous]), '/bundles/previous/components/button');
    await screen.findByRole('heading', { level: 1, name: 'button' });

    const tab = screen.getByRole('button', { name: 'Changes' });
    expect(tab).toBeDisabled();
    expect(tab).toHaveAttribute('title', 'This is the first release, so there is nothing to compare with.');
  });
});

describe('finding the previous release', () => {
  const opened = (id: string, release: string, state: 'candidate' | 'released', build: number, project = 'p') =>
    ({ id, result: { status: 'opened', bundle: { manifest: { project: { id: project, name: project }, release: { release, state, build } } }, problems: [] } }) as never;
  const current = (previousRelease: string | null) => ({ project: { id: 'p', name: 'p' }, release: { previousRelease } }) as never;

  it('has none for a first release', () => {
    expect(findPreviousBundle(current(null), [])).toEqual({ status: 'first-release' });
  });

  it('waits while a bundle is still being read', () => {
    expect(findPreviousBundle(current('2.3.0'), [{ id: 'x', result: undefined }])).toEqual({ status: 'loading' });
  });

  it('finds the release the manifest names, in the same project only', () => {
    const match = findPreviousBundle(current('2.3.0'), [opened('other', '2.3.0', 'released', 1, 'q'), opened('mine', '2.3.0', 'released', 1)]);

    expect(match).toMatchObject({ status: 'found', bundleId: 'mine' });
  });

  it('prefers a released build over a candidate, and a later build over an earlier one', () => {
    expect(findPreviousBundle(current('2.3.0'), [opened('cand', '2.3.0', 'candidate', 5), opened('rel1', '2.3.0', 'released', 1), opened('rel2', '2.3.0', 'released', 2)])).toMatchObject({ bundleId: 'rel2' });
  });

  it('does not guess when the release is not there', () => {
    expect(findPreviousBundle(current('2.3.0'), [opened('a', '2.2.0', 'released', 1)])).toEqual({ status: 'not-found', previousRelease: '2.3.0' });
  });
});

describe('subject labels and links from the catalog', () => {
  it('shows the provider label and description, and a link that opens safely', async () => {
    const { current } = makeReleasePair();
    const projection: Projection = projectionSchema.parse({
      ...current.projection,
      subjects: [{ id: 'button', kind: 'component', label: 'Button', description: 'Triggers actions', sourceUrl: 'https://design.example.com/button', changeNote: 'Spacing and focus states' }]
    });
    renderApp(await makeCatalog([{ ...current, projection }]), '/bundles/current/components/button');

    expect(await screen.findByRole('heading', { level: 1, name: 'Button' })).toBeInTheDocument();
    expect(screen.getByText('Triggers actions')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /Open the design source/ });
    expect(link).toHaveAttribute('href', 'https://design.example.com/button');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('shows the id and no link when the provider gave neither', async () => {
    const { current } = makeReleasePair();
    renderApp(await makeCatalog([current]), '/bundles/current/components/button');

    expect(await screen.findByRole('heading', { level: 1, name: 'button' })).toBeInTheDocument();
    expect(screen.queryByText(/Open the design source/)).not.toBeInTheDocument();
  });

  it('shows the provider change note on the card for that subject', async () => {
    const { previous, current } = makeReleasePair();
    const projection: Projection = projectionSchema.parse({ ...current.projection, subjects: [{ id: 'button', kind: 'component', label: 'Button', changeNote: 'Spacing and focus states' }] });
    renderApp(await makeCatalog([previous, { ...current, projection }]), changesPath);

    expect(await screen.findByText('Spacing and focus states')).toBeInTheDocument();
  });
});
