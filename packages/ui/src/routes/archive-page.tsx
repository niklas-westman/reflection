import { useParams } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import styled from 'styled-components';
import type { ArchiveSummary } from 'reflection-projection';
import { useReleaseHistory } from '../data/release-history';
import { Pill } from '../components/atoms/pill';
import { Spacer } from '../components/atoms/spacer';
import { Banner } from '../components/molecules/banner';
import { RequiredItemsPanel } from '../components/molecules/summary-groups';
import { AppShell } from '../components/organisms/app-shell';
import { ReleasePicker } from '../components/organisms/release-picker';
import { formatDate } from '../model/format';
import { paths } from './paths';

const Side = styled.nav`
  width: 15.5rem;
  flex: none;
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space.md};
  padding: ${({ theme }) => theme.space.md} ${({ theme }) => theme.space.sm};
  background: var(--surface);
  border-right: 1px solid var(--border);

  a {
    padding: 0.4375rem 0.625rem;
    border-radius: ${({ theme }) => theme.radius.md};
    color: inherit;
    text-decoration: none;
  }
  a:hover {
    background: var(--surface-2);
  }
`;

const Content = styled.main`
  flex: 1;
  min-width: 0;
  overflow: auto;
  padding: ${({ theme }) => theme.space.lg} ${({ theme }) => theme.space.xl};
`;

const Cards = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(22rem, 1fr));
  gap: ${({ theme }) => theme.space.sm};
  margin-top: ${({ theme }) => theme.space.sm};
`;

const Card = styled.section`
  padding: ${({ theme }) => theme.space.md};
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: ${({ theme }) => theme.radius.lg};

  h2 {
    margin: 0 0 ${({ theme }) => theme.space.xs};
    font-size: ${({ theme }) => theme.font.md};
  }
  dl {
    margin: 0;
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0.25rem ${({ theme }) => theme.space.sm};
    font-size: ${({ theme }) => theme.font.sm};
  }
  dt {
    color: var(--muted);
  }
  dd {
    margin: 0;
    text-align: right;
  }
  p {
    margin: 0 0 ${({ theme }) => theme.space.xs};
    font-size: ${({ theme }) => theme.font.sm};
  }
  .muted {
    color: var(--muted);
  }
`;

const STANDING_TEXT: Record<NonNullable<ArchiveSummary['decision']>['standing'], string> = {
  holds: 'Still matched the evidence when the release left its slot',
  'carried-forward': 'Carried forward from an earlier build of identical evidence',
  lapsed: 'No longer matched the evidence: something it was based on had changed',
  withdrawn: 'Withdrawn'
};

/**
 * A release whose evidence was removed. What remains is a small summary: counts, the decision, the design
 * sources with their dates, and the notes at exit. It is shown as a summary and never as evidence.
 */
export function ArchivePage(): ReactNode {
  const { project = '', release = '' } = useParams({ strict: false });
  const { history } = useReleaseHistory();
  const entry = history?.projects.find((candidate) => candidate.id === project)?.releases.find((candidate) => candidate.kind === 'archive' && candidate.release === release);
  const projectName = history?.projects.find((candidate) => candidate.id === project)?.name ?? project;

  return (
    <AppShell crumbs={[{ label: projectName }, { label: `${release} (summary only)` }]}>
      <Side aria-label="Release navigation">
        <ReleasePicker projectId={project} current={`archive:${project}/${release}`} />
        <a href={paths.bundles()}>All releases</a>
      </Side>
      <Content>
        {!history ? (
          <p role="status">Loading…</p>
        ) : !entry || entry.kind !== 'archive' ? (
          <Banner tone="idle" title={`No summary for ${release} in ${projectName}`}>
            <p style={{ margin: '0.25rem 0 0' }}>
              There is no archived release by that name. <a href={paths.bundles()}>See all releases</a>.
            </p>
          </Banner>
        ) : (
          <Summary summary={entry.summary} projectName={projectName} />
        )}
      </Content>
    </AppShell>
  );
}

function Summary({ summary, projectName }: { summary: ArchiveSummary; projectName: string }): ReactNode {
  const { decision, change } = summary;
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: '0.75rem' }}>
        <h1 style={{ margin: 0 }}>
          {projectName} {summary.release}
        </h1>
        <Pill $tone="idle">Summary only</Pill>
        <Pill $tone={summary.finalState === 'released' ? 'pass' : 'idle'}>{summary.finalState === 'released' ? 'Released' : `Superseded by ${summary.supersededBy ?? 'a later release'}`}</Pill>
      </div>
      <Spacer $size="sm" />
      <Banner tone="idle" title={`Historical release: its evidence was removed on ${formatDate(summary.removed.at)}`}>
        <p style={{ margin: '0.25rem 0 0' }}>
          {summary.removed.reason}. This is a summary of what was recorded, not evidence: there are no images, comparisons or measurements to inspect.
        </p>
      </Banner>
      <Spacer $size="sm" />
      <p style={{ margin: 0 }}>{summary.summary}</p>
      <Spacer />
      <RequiredItemsPanel items={summary.coverage} lowerBound={false} />
      <Cards>
        <Card aria-label="Decision">
          <h2>Decision</h2>
          {decision ? (
            <>
              <dl>
                <dt>Decision</dt>
                <dd>{decision.kind === 'approve' ? 'Approved' : 'Changes required'}</dd>
                <dt>By</dt>
                <dd>{decision.by}</dd>
                <dt>On</dt>
                <dd>{formatDate(decision.at)}</dd>
              </dl>
              {decision.message ? <p style={{ marginTop: '0.5rem' }}>“{decision.message}”</p> : null}
              <p className="muted" style={{ marginTop: '0.5rem' }}>
                {STANDING_TEXT[decision.standing]}.
              </p>
              {decision.acknowledged ? (
                <p className="muted">Acknowledged at the time: {Object.entries(decision.acknowledged).filter(([, count]) => count !== undefined).map(([name, count]) => `${count} ${name}`).join(', ') || 'nothing recorded'}.</p>
              ) : null}
            </>
          ) : (
            <p className="muted">No decision was recorded for this release.</p>
          )}
        </Card>
        <Card aria-label="Design sources">
          <h2>Design sources</h2>
          {summary.snapshots.length === 0 ? (
            <p className="muted">No design source was recorded.</p>
          ) : (
            <dl>
              {summary.snapshots.map((snapshot) => (
                <FactPair key={snapshot.id} label={snapshot.label ?? snapshot.role} value={`captured ${formatDate(snapshot.capturedAt)}`} />
              ))}
            </dl>
          )}
        </Card>
        <Card aria-label="Change since the previous release">
          <h2>Change since the previous release</h2>
          {change ? (
            <dl>
              <FactPair label="Compared with" value={change.against} />
              <FactPair label="Design snapshot" value={change.sameSnapshot ? 'Same as before' : 'Newer than before'} />
              <FactPair label="Regressed" value={String(change.regressed)} />
              <FactPair label="Fixed" value={String(change.fixed)} />
              <FactPair label="Still failing" value={String(change.stillFailing)} />
              <FactPair label="Newly enrolled" value={String(change.newlyEnrolled)} />
              <FactPair label="New in the design source" value={String(change.newInDesign)} />
              <FactPair label="Removed from the design source" value={String(change.removedInDesign)} />
            </dl>
          ) : (
            <p className="muted">This was the first release, so there was nothing to compare with.</p>
          )}
        </Card>
        <Card aria-label="Notes at exit">
          <h2>Notes at exit</h2>
          <dl>
            <FactPair label="Open" value={String(summary.notes.open)} />
            <FactPair label="Resolved" value={String(summary.notes.resolved)} />
          </dl>
        </Card>
      </Cards>
    </>
  );
}

function FactPair({ label, value }: { label: string; value: string }): ReactNode {
  return (
    <>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </>
  );
}
