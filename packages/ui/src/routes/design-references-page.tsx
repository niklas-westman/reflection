import { useMemo, type ReactNode } from 'react';
import styled from 'styled-components';
import { useBundleView } from '../data/bundle-context';
import { ExternalLink } from '../components/atoms/external-link';
import { summarizeDesignReferences } from '../model/design-references';
import { formatDate } from '../model/format';

const Cards = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(24rem, 1fr));
  gap: ${({ theme }) => theme.space.sm};
  margin-top: ${({ theme }) => theme.space.sm};
`;

const Card = styled.section`
  padding: ${({ theme }) => theme.space.md};
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: ${({ theme }) => theme.radius.lg};
  min-width: 0;

  h2 {
    margin: 0 0 ${({ theme }) => theme.space.xs};
    font-size: ${({ theme }) => theme.font.lg};
  }
  h3 {
    margin: ${({ theme }) => theme.space.md} 0 ${({ theme }) => theme.space.xs};
    font-size: ${({ theme }) => theme.font.md};
  }
  dl {
    margin: 0;
    display: grid;
    grid-template-columns: 9rem 1fr;
    gap: 0.25rem ${({ theme }) => theme.space.sm};
    font-size: ${({ theme }) => theme.font.sm};
  }
  dt {
    color: var(--muted);
  }
  dd {
    margin: 0;
    overflow-wrap: anywhere;
  }
  dd.mono {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: ${({ theme }) => theme.font.xs};
  }
  .muted {
    color: var(--muted);
    font-size: ${({ theme }) => theme.font.sm};
  }
`;

const Buckets = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  max-width: 32rem;
  font-size: ${({ theme }) => theme.font.sm};

  li {
    display: flex;
    justify-content: space-between;
    gap: ${({ theme }) => theme.space.sm};
    padding: 0.25rem 0;
    border-bottom: 1px solid var(--border);
  }
  li.zero {
    color: var(--muted);
  }
  li.zero strong {
    font-weight: normal;
  }
`;

const Notes = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space.sm};
  font-size: ${({ theme }) => theme.font.sm};

  .who {
    color: var(--muted);
  }
  blockquote {
    margin: 0.25rem 0 0;
    padding-left: ${({ theme }) => theme.space.sm};
    border-left: 2px solid var(--border-strong);
    white-space: pre-wrap;
  }
`;

/** The design data this release was proven against. Each source keeps its own date; they are never merged. */
export function DesignReferencesPage(): ReactNode {
  const { manifest, prepared } = useBundleView();
  const { snapshots, approvals, delegatedNotes } = useMemo(() => summarizeDesignReferences(prepared.projection), [prepared]);

  return (
    <>
      <h1 style={{ margin: 0 }}>Design references</h1>
      <p style={{ color: 'var(--muted)' }}>
        The design data {manifest.project.name} {manifest.release.release} was proven against. A proof is based on the source it actually read, so each source keeps its own date.
      </p>
      {snapshots.length === 0 ? (
        <p role="status">This bundle records no design source.</p>
      ) : (
        <Cards role="group" aria-label="Design sources">
          {snapshots.map(({ snapshot, usedByRelease, comparisons, subjects }) => (
            <Card key={snapshot.id} aria-label={snapshot.label ?? snapshot.role}>
              <h2>{snapshot.label ?? snapshot.role}</h2>
              <dl>
                <dt>Role</dt>
                <dd>{snapshot.role}</dd>
                <dt>Kind</dt>
                <dd>{snapshot.kind}</dd>
                <dt>Captured</dt>
                <dd>{formatDate(snapshot.capturedAt)}</dd>
                {snapshot.upstreamModifiedAt ? (
                  <>
                    <dt>Source modified</dt>
                    <dd>{formatDate(snapshot.upstreamModifiedAt)}</dd>
                  </>
                ) : null}
                {snapshot.version ? (
                  <>
                    <dt>Version</dt>
                    <dd className="mono">{snapshot.version}</dd>
                  </>
                ) : null}
                {snapshot.fileKey ? (
                  <>
                    <dt>Source file</dt>
                    <dd className="mono">{snapshot.fileKey}</dd>
                  </>
                ) : null}
                {snapshot.originalFileKey ? (
                  <>
                    <dt>Copied from</dt>
                    <dd className="mono">{snapshot.originalFileKey}</dd>
                  </>
                ) : null}
                {snapshot.sha256 ? (
                  <>
                    <dt>Content hash</dt>
                    <dd className="mono">{snapshot.sha256}</dd>
                  </>
                ) : null}
                {snapshot.sourceUrl ? (
                  <>
                    <dt>Link</dt>
                    <dd>
                      <ExternalLink href={snapshot.sourceUrl}>Open the design source</ExternalLink>
                    </dd>
                  </>
                ) : null}
                <dt>Used by this release</dt>
                <dd>{usedByRelease ? 'Yes' : 'Not listed by the release'}</dd>
                <dt>Read by</dt>
                <dd>{comparisons === 0 ? 'No comparison in this bundle' : `${comparisons} ${comparisons === 1 ? 'comparison' : 'comparisons'} in ${subjects} ${subjects === 1 ? 'subject' : 'subjects'}`}</dd>
              </dl>
              {snapshot.note ? <p className="muted">{snapshot.note}</p> : null}
            </Card>
          ))}
        </Cards>
      )}
      <Card aria-label="Reference approvals" style={{ marginTop: '1rem' }}>
        <h2>Reference approvals</h2>
        <p className="muted">Whether a person has confirmed that each reference is the approved design, counted per comparison, strongest first.</p>
        <Buckets>
          {[
            { label: 'Approved and recorded by a person', count: approvals.byPerson },
            { label: 'Approved by a person, written down by an agent', count: approvals.byPersonThroughAgent },
            { label: "Recorded by an agent, no person's words", count: approvals.byAgent },
            { label: 'Approval no longer matches the reference', count: approvals.lapsed },
            { label: 'Not approved', count: approvals.none },
            { label: 'No reference', count: approvals.noReference }
          ].map((bucket) => (
            <li key={bucket.label} className={bucket.count === 0 ? 'zero' : undefined}>
              <span>{bucket.label}</span>
              <strong>{bucket.count}</strong>
            </li>
          ))}
        </Buckets>
        {delegatedNotes.length > 0 ? (
          <>
            <h3>Written down by an agent</h3>
            <p className="muted">What the agent recorded for each approval, as the provider kept it. The person can correct any that do not match what they meant.</p>
            <Notes>
              {delegatedNotes.map((entry) => (
                <li key={`${entry.at ?? ''}|${entry.note}`}>
                  <div className="who">
                    {entry.by ?? 'A person'}, written down by {entry.recordedBy ?? 'an agent'}
                    {entry.at ? `, ${formatDate(entry.at)}` : ''} · {entry.comparisons} {entry.comparisons === 1 ? 'comparison' : 'comparisons'}
                  </div>
                  <blockquote>{entry.note}</blockquote>
                </li>
              ))}
            </Notes>
          </>
        ) : null}
      </Card>
    </>
  );
}
