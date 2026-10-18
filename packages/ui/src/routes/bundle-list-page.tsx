import type { ReactNode } from 'react';
import styled from 'styled-components';
import type { OpenBundleResult } from 'reflection-projection';
import { useBundleList, useOpenedBundles } from '../data/bundle-queries';
import { Pill } from '../components/atoms/pill';
import { ValidityPill } from '../components/organisms/validity-pill';
import { AppShell } from '../components/organisms/app-shell';
import { prepareBundle } from '../model/bundle-state';
import { formatDate } from '../model/format';
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

export function BundleListPage(): ReactNode {
  const list = useBundleList();
  const opened = useOpenedBundles(list.data ?? []);

  return (
    <AppShell crumbs={[{ label: 'Bundles' }]}>
      <Page>
        <h1>Bundles</h1>
        <p>Each bundle is one immutable set of evidence. Open one to see what was proven.</p>
        {list.isPending ? <p>Loading bundles…</p> : null}
        {list.isError ? <p role="alert">{list.error.message}</p> : null}
        {list.data && list.data.length === 0 ? <p>No bundles were found. Create the demo bundles with <code>pnpm --filter reflection-ui demo-bundles</code>.</p> : null}
        {list.data && list.data.length > 0 ? (
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
                <BundleRow key={entry.id} id={entry.id} state={opened[index]?.data} pending={opened[index]?.isPending ?? true} />
              ))}
            </tbody>
          </table>
        ) : null}
      </Page>
    </AppShell>
  );
}

function BundleRow({ id, state, pending }: { id: string; state: OpenBundleResult | undefined; pending: boolean }): ReactNode {
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
          <Pill $tone="fail">Bundle rejected</Pill> {state.problems[0]?.message}
        </td>
      </tr>
    );
  }

  const prepared = prepareBundle(state.bundle, state.problems);
  const { manifest } = state.bundle;
  return (
    <tr>
      <td>
        <a href={paths.bundle(id)}>{manifest.project.name}</a>
        <div style={{ color: 'var(--muted)', fontSize: '0.75rem' }}>{id}</div>
      </td>
      <td>
        {manifest.release.release} · build {manifest.release.build} <Pill $tone={manifest.release.state === 'released' ? 'pass' : 'gap'}>{manifest.release.state === 'released' ? 'Released' : 'Candidate'}</Pill>
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
