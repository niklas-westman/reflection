import type { ReactNode } from 'react';
import styled from 'styled-components';
import type { OpenBundleResult } from 'reflection-projection';
import { useArchive, useBundleList, useLatest, useOpenedBundles } from '../data/bundle-queries';
import { Pill } from '../components/atoms/pill';
import { ValidityPill } from '../components/organisms/validity-pill';
import { AppShell } from '../components/organisms/app-shell';
import { prepareBundle } from '../model/bundle-state';
import { formatDate, releaseStateLabel } from '../model/format';
import { paths } from './paths';

const Page = styled.main`
  flex: 1;
  overflow: auto;
  padding: ${({ theme }) => theme.space.lg} ${({ theme }) => theme.space.xl};

  h1 {
    margin: 0 0 ${({ theme }) => theme.space.xs};
    font-size: ${({ theme }) => theme.font.xl};
    letter-spacing: -0.02em;
  }
  p {
    margin: 0 0 ${({ theme }) => theme.space.md};
    color: var(--muted);
  }
  table {
    width: 100%;
    border-collapse: collapse;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: ${({ theme }) => theme.radius.lg};
  }
  th,
  td {
    text-align: left;
    padding: ${({ theme }) => theme.space.sm} ${({ theme }) => theme.space.md};
    border-bottom: 1px solid var(--border);
  }
  th {
    color: var(--muted);
    font-size: ${({ theme }) => theme.font.xs};
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-weight: 550;
  }
`;

// On a narrow screen a table scrolls sideways inside its own frame, never the whole page.
const TableScroll = styled.div`
  overflow-x: auto;
  max-width: 100%;
`;

export function BundleListPage(): ReactNode {
  const list = useBundleList();
  const latest = useLatest();
  const opened = useOpenedBundles(list.data ?? []);
  const latestIds = new Set(Object.values(latest.data ?? {}).filter((id): id is string => id !== null));
  // A latest bundle the host names but does not hold is said out loud, never replaced by another one.
  const missingLatest = Object.entries(latest.data ?? {}).filter(([, id]) => id !== null && !(list.data ?? []).some((entry) => entry.id === id));
  const archive = useArchive();
  const summaries = archive.data?.summaries ?? [];

  return (
    <AppShell crumbs={[{ label: 'Bundles' }]}>
      <Page>
        <h1>Bundles</h1>
        <p>Each bundle is one immutable set of evidence. Open one to see what was proven.</p>
        {list.isPending ? <p>Loading bundles…</p> : null}
        {list.isError ? <p role="alert">{list.error.message}</p> : null}
        {list.data && list.data.length === 0 ? <p>No bundles were found. Create the demo bundles with <code>pnpm --filter reflection-ui demo-bundles</code>.</p> : null}
        {missingLatest.map(([project, id]) => (
          <p key={project} role="alert">
            The host names {id} as the latest bundle of {project}, but that bundle is not here.
          </p>
        ))}
        {list.data && list.data.length > 0 ? (
          <TableScroll tabIndex={0} role="region" aria-label="Bundles, as a table">
          <table>
            <thead>
              <tr>
                <th scope="col">Project</th>
                <th scope="col">Release</th>
                <th scope="col">Evidence</th>
                <th scope="col">Required</th>
                <th scope="col">Proven</th>
                <th scope="col">Failing</th>
                <th scope="col">Built</th>
              </tr>
            </thead>
            <tbody>
              {list.data.map((entry, index) => (
                <BundleRow key={entry.id} id={entry.id} latest={latestIds.has(entry.id)} state={opened[index]?.data} pending={opened[index]?.isPending ?? true} />
              ))}
            </tbody>
          </table>
          </TableScroll>
        ) : null}
        {summaries.length > 0 || (archive.data?.unreadable ?? 0) > 0 ? (
          <section aria-label="Earlier releases">
            <h2 style={{ margin: '2rem 0 0.25rem', fontSize: '1.0625rem' }}>Earlier releases (summary only)</h2>
            <p>Their evidence was removed to save space. What remains is a summary, not evidence.</p>
            {(archive.data?.unreadable ?? 0) > 0 ? <p role="status">{archive.data?.unreadable} archive {archive.data?.unreadable === 1 ? 'entry' : 'entries'} could not be read and {archive.data?.unreadable === 1 ? 'is' : 'are'} not listed.</p> : null}
            {summaries.length > 0 ? (
              <TableScroll tabIndex={0} role="region" aria-label="Earlier releases, as a table">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Project</th>
                    <th scope="col">Release</th>
                    <th scope="col">Decision</th>
                    <th scope="col">Required</th>
                    <th scope="col">Proven</th>
                    <th scope="col">Failing</th>
                    <th scope="col">Removed</th>
                  </tr>
                </thead>
                <tbody>
                  {summaries.map((summary) => (
                    <tr key={`${summary.project}/${summary.release}/${summary.build}`}>
                      <td>{summary.project}</td>
                      <td>
                        <a href={paths.archive(summary.project, summary.release)}>
                          {summary.release} · build {summary.build}
                        </a>{' '}
                        <Pill $tone="idle">{summary.finalState === 'released' ? 'Released' : 'Superseded'}</Pill>
                      </td>
                      <td>{summary.decision ? (summary.decision.kind === 'approve' ? 'Approved' : 'Changes required') : 'None recorded'}</td>
                      <td>{summary.coverage.required}</td>
                      <td>{summary.coverage.proven}</td>
                      <td>{summary.coverage.failing}</td>
                      <td>{formatDate(summary.removed.at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </TableScroll>
            ) : null}
          </section>
        ) : null}
      </Page>
    </AppShell>
  );
}

function BundleRow({ id, latest, state, pending }: { id: string; latest: boolean; state: OpenBundleResult | undefined; pending: boolean }): ReactNode {
  if (pending || !state) {
    return (
      <tr>
        <td colSpan={7}>{id}: loading…</td>
      </tr>
    );
  }
  if (state.status === 'rejected') {
    return (
      <tr>
        <td>
          <a href={paths.bundle(id)}>{id}</a>
        </td>
        <td colSpan={6}>
          {latest ? <Pill $tone="fail">Latest</Pill> : null} <Pill $tone="fail">Bundle rejected</Pill> {state.problems[0]?.message}
        </td>
      </tr>
    );
  }

  const prepared = prepareBundle(state.bundle, state.problems);
  const { manifest } = state.bundle;
  return (
    <tr>
      <td>
        <a href={paths.bundle(id)}>{manifest.project.name}</a> {latest ? <Pill $tone="idle">Latest</Pill> : null}
        <div style={{ color: 'var(--muted)', fontSize: '0.75rem' }}>{id}</div>
      </td>
      <td>
        {manifest.release.release} · build {manifest.release.build} <Pill $tone={manifest.release.state === 'released' ? 'pass' : 'gap'}>{releaseStateLabel(manifest.release.state)}</Pill>
      </td>
      <td>
        <ValidityPill validity={prepared.validity} />
      </td>
      <td>{prepared.summary.required}</td>
      <td>{prepared.summary.proven}</td>
      <td>{prepared.summary.failing}</td>
      <td>{formatDate(manifest.release.builtAt)}</td>
    </tr>
  );
}
