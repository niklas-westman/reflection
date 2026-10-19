import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider } from 'styled-components';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { projectionSchema, type Projection } from 'reflection-projection';
import { BundleViewProvider, type OpenBundleView } from '../src/data/bundle-context';
import { EvidenceNotice } from '../src/components/organisms/evidence-notice';
import { buildReleaseHistory, describeRelease } from '../src/model/release-history';
import { summarizeDesignReferences } from '../src/model/design-references';
import { theme } from '../src/theme/theme';
import { makeArchiveSummary, makeCatalog, makeProjection, makeReleasePair } from './helpers/test-bundles';
import { renderApp } from './helpers/render-app';

const opened = (id: string, release: string, project = 'docs-site', build = 1, state: 'candidate' | 'released' = 'released', builtAt = '2026-10-10T00:00:00.000Z') =>
  ({ id, result: { status: 'opened', bundle: { manifest: { project: { id: project, name: project === 'docs-site' ? 'Docs site' : project }, release: { release, build, state, builtAt } } }, problems: [] } }) as never;

describe('the release history model', () => {
  it('groups releases by project, newest bundle first, then summaries most recently removed first', () => {
    const history = buildReleaseHistory({
      bundles: [opened('old', '2.3.0', 'docs-site', 1, 'released', '2026-10-01T00:00:00.000Z'), opened('new', '2.4.0', 'docs-site', 1, 'candidate', '2026-10-10T00:00:00.000Z'), opened('other', '1.0.0', 'sourcer')],
      archive: [makeArchiveSummary({ release: '2.1.0', removed: { at: '2026-10-20T00:00:00.000Z', reason: 'x' } }), makeArchiveSummary({ release: '2.2.0', removed: { at: '2026-11-01T00:00:00.000Z', reason: 'x' } })]
    });

    expect(history.projects.map((project) => project.id)).toEqual(['docs-site', 'sourcer']);
    expect(history.projects[0]?.releases.map((entry) => [entry.kind, entry.release])).toEqual([['bundle', '2.4.0'], ['bundle', '2.3.0'], ['archive', '2.2.0'], ['archive', '2.1.0']]);
    expect(history.projects[0]?.name).toBe('Docs site');
  });

  it('lists a project that exists only as summaries, by its id', () => {
    const history = buildReleaseHistory({ bundles: [], archive: [makeArchiveSummary({ project: 'legacy' })] });

    expect(history.projects).toEqual([expect.objectContaining({ id: 'legacy', name: 'legacy' })]);
  });

  it('names a rejected bundle apart, belonging to no project', () => {
    const history = buildReleaseHistory({ bundles: [{ id: 'broken', result: { status: 'rejected', problems: [] } }], archive: [] });

    expect(history).toEqual({ projects: [], rejected: ['broken'] });
  });

  it('describes a release the way the picker shows it', () => {
    const history = buildReleaseHistory({ bundles: [opened('a', '2.4.0', 'docs-site', 2, 'candidate')], archive: [makeArchiveSummary()] });

    expect(history.projects[0]?.releases.map(describeRelease)).toEqual(['2.4.0 · build 2 · Unreleased', '2.2.0 · build 1 · summary only']);
  });
});

// The release pair belongs to the project "marwes-like"; summaries must too to be part of its history.
const summary = (overrides: Parameters<typeof makeArchiveSummary>[0] = {}) => makeArchiveSummary({ project: 'marwes-like', ...overrides });

async function openWith(path: string, archive = [summary()]) {
  const { previous, current } = makeReleasePair();
  renderApp(await makeCatalog([previous, current], { archive }), path);
}

describe('the release picker', () => {
  it('lists the releases of the project, with summaries labelled as such', async () => {
    await openWith('/bundles/current');
    await screen.findByRole('heading', { name: 'Release status' });

    const select = await screen.findByLabelText('Change release');
    // Every bundle is read before it can be listed, so the list fills in.
    await waitFor(() => expect(within(select).getAllByRole('option').map((option) => option.textContent)).toEqual(['2.4.0 · build 1 · Unreleased', '2.3.0 · build 1 · Released', '2.2.0 · build 1 · summary only']));
  });

  it('opens another bundle in full, and a summary as a summary', async () => {
    await openWith('/bundles/current');
    const select = await screen.findByLabelText('Change release');
    await waitFor(() => expect(within(select).getAllByRole('option')).toHaveLength(3));

    await userEvent.selectOptions(select, 'bundle:previous');
    await waitFor(() => expect(screen.getByRole('link', { name: 'Overview' })).toHaveAttribute('href', '#/bundles/previous'));

    await userEvent.selectOptions(await screen.findByLabelText('Change release'), 'archive:marwes-like/2.2.0');
    expect(await screen.findByText('Summary only')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: /2\.2\.0/ })).toBeInTheDocument();
  });

  it('offers the project too, only when there is more than one', async () => {
    await openWith('/bundles/current', [summary(), makeArchiveSummary({ project: 'sourcer', release: '1.0.0' })]);

    const project = await screen.findByLabelText('Change project');
    expect(within(project).getAllByRole('option').map((option) => option.textContent)).toEqual(['Components', 'sourcer']);
  });

  it('has no project choice for a single project', async () => {
    await openWith('/bundles/current');
    await screen.findByLabelText('Change release');

    expect(screen.queryByLabelText('Change project')).not.toBeInTheDocument();
  });
});

describe('a release that is only a summary', () => {
  const archivePath = '/archive/marwes-like/2.2.0';

  it('says its evidence was removed and that this is not evidence', async () => {
    await openWith(archivePath);

    expect(await screen.findByText('Historical release: its evidence was removed on 1 Nov 2026')).toBeInTheDocument();
    expect(screen.getByText(/This is a summary of what was recorded, not evidence/)).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(document.querySelectorAll('img')).toHaveLength(0);
  });

  it('keeps an unreported count unknown, in required items only, with no percentage', async () => {
    await openWith(archivePath);
    await screen.findByLabelText('Required items');

    const stat = (label: string) => within(screen.getByLabelText('Required items')).getByText(label, { selector: 'dt' }).parentElement?.querySelector('dd')?.textContent;
    expect([stat('Required'), stat('Proven'), stat('Failing'), stat('Needs design'), stat('Not enrolled'), stat('Not proven')]).toEqual(['40', '31', '2', 'Unknown', '4', '3']);
    expect(document.body.textContent).not.toContain('%');
  });

  it('shows the decision as it stood when the release left its slot', async () => {
    await openWith(archivePath);

    const decision = within(await screen.findByLabelText('Decision'));
    expect(decision.getByText('Approved')).toBeInTheDocument();
    expect(decision.getByText('designer@example.com')).toBeInTheDocument();
    expect(decision.getByText('“Looks right to me”')).toBeInTheDocument();
    expect(decision.getByText(/Still matched the evidence when the release left its slot/)).toBeInTheDocument();
    expect(decision.getByText(/Acknowledged at the time: 2 stillFailing/)).toBeInTheDocument();
  });

  it('says so when no decision was recorded, and when the decision had lapsed', async () => {
    await openWith(archivePath, [summary({ decision: null })]);
    expect(await screen.findByText('No decision was recorded for this release.')).toBeInTheDocument();
  });

  it('shows each design source with its own date, the change since the previous release and the notes', async () => {
    await openWith(archivePath);

    expect(within(await screen.findByLabelText('Design sources')).getByText('captured 20 Sep 2026')).toBeInTheDocument();
    const change = within(screen.getByLabelText('Change since the previous release'));
    expect(change.getByText('2.1.0')).toBeInTheDocument();
    expect(change.getByText('Newer than before')).toBeInTheDocument();
    expect(within(screen.getByLabelText('Notes at exit')).getByText('Open').nextSibling).toHaveTextContent('1');
  });

  it('says it was the first release when there was nothing to compare with', async () => {
    await openWith(archivePath, [summary({ change: null })]);

    expect(await screen.findByText('This was the first release, so there was nothing to compare with.')).toBeInTheDocument();
  });

  it('says so for a release that has no summary', async () => {
    await openWith('/archive/marwes-like/9.9.9');

    expect(await screen.findByText('No summary for 9.9.9 in Components')).toBeInTheDocument();
  });

  it('is listed with the other releases, with a count of entries that could not be read', async () => {
    const { previous, current } = makeReleasePair();
    renderApp(await makeCatalog([previous, current], { archive: [summary()], unreadableArchive: 2 }), '/');

    const section = within(await screen.findByLabelText('Earlier releases'));
    expect(section.getByRole('link', { name: /2\.2\.0 · build 1/ })).toHaveAttribute('href', '#/archive/marwes-like/2.2.0');
    expect(section.getByText('2 archive entries could not be read and are not listed.')).toBeInTheDocument();
  });

  it('is what the changes page points to when the previous release exists only as a summary', async () => {
    const { current } = makeReleasePair();
    renderApp(await makeCatalog([current], { archive: [makeArchiveSummary({ project: 'marwes-like', release: '2.3.0' })] }), '/bundles/current/changes');

    expect(await screen.findByRole('link', { name: 'See the summary of 2.3.0' })).toHaveAttribute('href', '#/archive/marwes-like/2.3.0');
  });
});

describe('the design references page', () => {
  it('lists each source with its own date, what reads it, and the reference approvals', async () => {
    const { current } = makeReleasePair();
    renderApp(await makeCatalog([current]), '/bundles/current/design-references');

    const source = within(await screen.findByLabelText('Design file'));
    expect(source.getByText('14 Oct 2026')).toBeInTheDocument();
    expect(source.getByText('Yes')).toBeInTheDocument();
    expect(source.getByText(/comparisons in 2 subjects|comparison in 1 subject|comparisons in 1 subject/)).toBeInTheDocument();
    const approvals = within(screen.getByLabelText('Reference approvals'));
    expect(approvals.getByText('Approved and recorded by a person').nextSibling).toHaveTextContent(/^\d+$/);
    expect(screen.getByRole('link', { name: 'Design references' })).toHaveAttribute('aria-current', 'page');
  });

  it('shows a link only when the provider gave one, and opens it safely', async () => {
    const { current } = makeReleasePair();
    const projection: Projection = projectionSchema.parse({ ...current.projection, snapshots: current.projection.snapshots.map((snapshot) => ({ ...snapshot, sourceUrl: 'https://design.example.com/file' })) });
    renderApp(await makeCatalog([{ ...current, projection }]), '/bundles/current/design-references');

    const link = await screen.findByRole('link', { name: /Open the design source/ });
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('says when the bundle records no design source', async () => {
    const projection: Projection = projectionSchema.parse({ ...makeProjection(), snapshots: [], comparisons: [], requirements: [] });
    renderApp(await makeCatalog([{ id: 'x', projection, release: { snapshotIds: [] } }]), '/bundles/x/design-references');

    expect(await screen.findByText('This bundle records no design source.')).toBeInTheDocument();
  });

  it('counts approvals by who recorded them, and never mixes an agent record in with a person', () => {
    const projection = makeProjection();
    const [first, second, third] = projection.comparisons;
    if (first?.reference) first.reference.approval = { state: 'holds', attestation: 'agent', by: 's', at: '2026-10-14T09:00:00.000Z' };
    if (second?.reference) second.reference.approval = { state: 'lapsed', attestation: 'human', by: 'p', at: '2026-10-14T09:00:00.000Z' };
    if (third?.reference) delete (third as { reference?: unknown }).reference;

    expect(summarizeDesignReferences(projection).approvals).toEqual({ byPerson: 3, byPersonThroughAgent: 0, byAgent: 1, lapsed: 1, none: 0, noReference: 1 });
  });

  it('lists each delegated record once with the comparisons it covers, and greys the buckets that are empty', async () => {
    const projection = makeProjection();
    const delegated = { state: 'holds', attestation: 'delegated', by: 'Owner', recordedBy: 'Assistant', at: '2026-10-13T20:56:08.000Z', note: 'Looks solid.' } as const;
    for (const comparison of projection.comparisons) {
      if (comparison.reference) comparison.reference.approval = { ...delegated };
    }
    const covered = projection.comparisons.filter((comparison) => comparison.reference).length;
    expect(summarizeDesignReferences(projection).delegatedNotes).toEqual([{ by: 'Owner', recordedBy: 'Assistant', at: '2026-10-13T20:56:08.000Z', note: 'Looks solid.', comparisons: covered }]);

    renderApp(await makeCatalog([{ id: 'x', projection }]), '/bundles/x/design-references');
    const approvals = within(await screen.findByLabelText('Reference approvals'));
    expect(approvals.getByText(`Owner, written down by Assistant, 13 Oct 2026 · ${covered} comparisons`)).toBeInTheDocument();
    expect(approvals.getByText('Looks solid.')).toBeInTheDocument();
    expect(approvals.getByText('Approved and recorded by a person').closest('li')).toHaveClass('zero');
    expect(approvals.getByText('Approved by a person, written down by an agent').closest('li')).not.toHaveClass('zero');
  });
});

describe('states that need attention', () => {
  it('says nothing was run when the bundle records no run, and the pill agrees', async () => {
    const projection = makeProjection({ runs: [] });
    renderApp(await makeCatalog([{ id: 'docs-site', projection }]), '/bundles/docs-site');

    expect(await screen.findByText('Nothing has been run for this bundle')).toBeInTheDocument();
    expect(screen.getAllByText('Never run').length).toBeGreaterThan(0);
  });

  it('says there is nothing to show for a bundle with no required items and no comparisons', async () => {
    const projection: Projection = projectionSchema.parse({ ...makeProjection(), requirements: [], comparisons: [] });
    renderApp(await makeCatalog([{ id: 'docs-site', projection }]), '/bundles/docs-site');

    expect(await screen.findByText('This bundle has no required items and no comparisons')).toBeInTheDocument();
  });

  const viewWith = (patch: Partial<OpenBundleView['prepared']>, verificationFailed?: string): OpenBundleView =>
    ({
      bundleId: 'b',
      manifest: {} as never,
      unusablePaths: new Set(),
      verifying: false,
      verificationFailed,
      prepared: { projection: makeProjection(), validity: { state: 'offline' }, problems: [], unusableComparisonIds: new Set(), summary: {} as never, ...patch }
    }) as OpenBundleView;
  const renderNotice = (view: OpenBundleView) =>
    render(
      <ThemeProvider theme={theme}>
        <BundleViewProvider value={view}>
          <EvidenceNotice />
        </BundleViewProvider>
      </ThemeProvider>
    );

  it('says the evidence is stale and names what changed, when a runner supplies current inputs', () => {
    renderNotice(viewWith({ validity: { state: 'stale', causes: [{ role: 'baseline', key: 'baselines/a.png', change: 'changed' }, { role: 'config', key: 'reflection.config.ts', change: 'changed' }] } }));

    expect(screen.getByText('This evidence is stale')).toBeInTheDocument();
    expect(screen.getByText('baselines/a.png')).toBeInTheDocument();
    expect(screen.getByText('reflection.config.ts')).toBeInTheDocument();
  });

  it('says verification did not finish and that each image is still checked when shown', () => {
    renderNotice(viewWith({}, 'network down'));

    expect(screen.getByText('Files could not be fully verified')).toBeInTheDocument();
    expect(screen.getByText(/network down/)).toBeInTheDocument();
    expect(screen.getByText(/Each image is still checked when it is shown/)).toBeInTheDocument();
  });

  it('shows invalid evidence before anything else', () => {
    renderNotice(viewWith({ validity: { state: 'invalid', reasons: ['x'] }, problems: [{ code: 'file-missing', path: 'a.png', message: 'missing' }] }, 'network down'));

    expect(screen.getByText(/Some evidence in this bundle is unusable/)).toBeInTheDocument();
    expect(screen.queryByText('Files could not be fully verified')).not.toBeInTheDocument();
  });
});

describe('releases that read the same', () => {
  it('are told apart by their bundle id in the picker', async () => {
    const { current } = makeReleasePair();
    renderApp(await makeCatalog([current, { ...current, id: 'current-copy' }]), '/bundles/current');

    const select = await screen.findByLabelText('Change release');
    await waitFor(() => expect(within(select).getAllByRole('option').map((option) => option.textContent)).toEqual(['2.4.0 · build 1 · Unreleased (current)', '2.4.0 · build 1 · Unreleased (current-copy)']));
  });
});
