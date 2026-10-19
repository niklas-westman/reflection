import { useNavigate, useSearch } from '@tanstack/react-router';
import { useMemo, type ReactNode } from 'react';
import styled from 'styled-components';
import type { ProjectionDiff } from 'reflection-projection';
import { useBundleView } from '../data/bundle-context';
import { useReleaseDiff } from '../data/release-diff';
import { Spacer } from '../components/atoms/spacer';
import { Segmented } from '../components/atoms/segmented';
import { Banner } from '../components/molecules/banner';
import { ChangeCard } from '../components/organisms/change-card';
import { ChangesCard } from '../components/organisms/release-cards';
import { FILTERS, parseChangesSearch, toChangesSearch, visibleChanges, type ChangeFilter, type ChangesView } from '../model/changes-view';
import { groupBySubject } from '../model/subject-model';
import { paths, type SubjectKind } from './paths';

const Title = styled.div`
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.space.sm};

  h1 {
    margin: 0;
    font-size: ${({ theme }) => theme.font.xl};
    letter-spacing: -0.02em;
  }
  .against {
    color: var(--muted);
  }
`;

const Summary = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
  gap: ${({ theme }) => theme.space.sm};

  section {
    padding: ${({ theme }) => theme.space.md};
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: ${({ theme }) => theme.radius.lg};
  }
  h2 {
    margin: 0;
    font-size: ${({ theme }) => theme.font.sm};
    font-weight: 550;
    color: var(--muted);
  }
  .count {
    font-size: 1.75rem;
    font-weight: 650;
    line-height: 1.2;
    letter-spacing: -0.02em;
  }
  .meta {
    color: var(--muted);
    font-size: ${({ theme }) => theme.font.xs};
  }
`;

const Tools = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: ${({ theme }) => theme.space.sm};

  input {
    width: 16rem;
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--text);
    border-radius: ${({ theme }) => theme.radius.md};
    padding: 0.4375rem ${({ theme }) => theme.space.sm};
  }
`;

const Cards = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(26rem, 1fr));
  gap: ${({ theme }) => theme.space.sm};
`;

const FILTER_TEXT: Record<ChangeFilter, string> = { all: 'All changes', added: 'Added', updated: 'Updated', removed: 'Removed' };

/**
 * What changed since the previous release, as a change to the catalog of required items and their design
 * references. It is not a verification result and is shown apart from one.
 */
export function ChangesPage(): ReactNode {
  const { manifest, prepared } = useBundleView();
  const state = useReleaseDiff();
  const delta = prepared.projection.delta;

  return (
    <>
      <Title>
        <h1>Changes in {manifest.release.release}</h1>
        {state.status === 'ready' ? <span className="against">Compared with {state.previousRelease}</span> : null}
      </Title>
      <Spacer $size="sm" />
      {state.status === 'first-release' ? (
        <Banner tone="idle" title="This is the first release">
          <p style={{ margin: '0.25rem 0 0' }}>There is no earlier release to compare with.</p>
        </Banner>
      ) : null}
      {state.status === 'loading' ? <p role="status">Loading the previous release…</p> : null}
      {state.status === 'unavailable' ? (
        <>
          <Banner tone="idle" title={`The previous release (${state.previousRelease}) is not available here`}>
            <p style={{ margin: '0.25rem 0 0' }}>It may have been removed to save space, or it was never published to this viewer, so before and after images cannot be shown.</p>
          </Banner>
          {delta && delta.against !== null ? (
            <>
              <Spacer $size="sm" />
              <ChangesCard delta={{ ...delta, against: delta.against }} />
            </>
          ) : null}
        </>
      ) : null}
      {state.status === 'ready' ? <Changes diff={state.diff} /> : null}
    </>
  );
}

function Changes({ diff }: { diff: ProjectionDiff }): ReactNode {
  const { bundleId, manifest, prepared } = useBundleView();
  const state = useReleaseDiff();
  const navigate = useNavigate();
  const view = parseChangesSearch(useSearch({ strict: false }) as Record<string, unknown>);
  const subjects = useMemo(() => groupBySubject(prepared.projection), [prepared]);
  const previousSubjects = useMemo(() => (state.status === 'ready' ? groupBySubject(state.previousProjection) : []), [state]);
  if (state.status !== 'ready') return null;

  const labelOf = (kind: SubjectKind, id: string): string =>
    subjects.find((subject) => subject.kind === kind && subject.id === id)?.label ?? previousSubjects.find((subject) => subject.kind === kind && subject.id === id)?.label ?? id;
  const visible = visibleChanges(diff.subjects, view, (subject) => labelOf(subject.kind, subject.id));
  const countOf = (filter: ChangeFilter): number => (filter === 'all' ? diff.subjects.length - diff.totals.subjects.unchanged : diff.totals.subjects[filter]);
  const update = (next: Partial<ChangesView>): void => {
    void navigate({ to: '.', replace: true, search: toChangesSearch({ ...view, ...next }) as never });
  };

  return (
    <>
      <Summary aria-label="Summary of changes">
        <section aria-label="Added">
          <h2>Added</h2>
          <div className="count">{diff.totals.items.added}</div>
          <div className="meta">required items · {diff.totals.subjects.added} new subjects</div>
        </section>
        <section aria-label="Updated">
          <h2>Updated</h2>
          <div className="count">{diff.totals.items.referenceChanged}</div>
          <div className="meta">references changed · {diff.totals.subjects.updated} subjects updated</div>
        </section>
        <section aria-label="Removed">
          <h2>Removed</h2>
          <div className="count">{diff.totals.items.removed}</div>
          <div className="meta">required items · {diff.totals.subjects.removed} subjects removed</div>
        </section>
      </Summary>
      <p className="meta" style={{ color: 'var(--muted)', margin: '0.5rem 0 0' }}>
        {diff.totals.subjects.unchanged} {diff.totals.subjects.unchanged === 1 ? 'subject is' : 'subjects are'} unchanged. A change here is a change to what must be proven or to its design; it is not a pass or a fail.
      </p>
      <Spacer />
      <Tools>
        <Segmented role="group" aria-label="Kind of change">
          {FILTERS.map((filter) => (
            <button key={filter} type="button" aria-pressed={view.kind === filter} onClick={() => update({ kind: filter })}>
              {FILTER_TEXT[filter]} ({countOf(filter)})
            </button>
          ))}
        </Segmented>
        <input type="search" placeholder="Search changes" aria-label="Search changes" value={view.search} onChange={(event) => update({ search: event.target.value })} />
      </Tools>
      <Spacer $size="sm" />
      {visible.length === 0 ? (
        <p role="status">{diff.subjects.length - diff.totals.subjects.unchanged === 0 ? 'Nothing changed in the catalog of required items or their design references.' : 'No change matches these filters.'}</p>
      ) : (
        <Cards aria-label="Changes to inspect">
          {visible.map((change) => {
            const subject = subjects.find((entry) => entry.kind === change.kind && entry.id === change.id);
            return (
              <ChangeCard
                key={`${change.kind}/${change.id}`}
                change={change}
                label={labelOf(change.kind, change.id)}
                subject={subject}
                href={subject ? paths.subject(bundleId, subject.kind, subject.id) : undefined}
                previousRelease={state.previousRelease}
                currentRelease={manifest.release.release}
                previousSource={state.previousSource}
              />
            );
          })}
        </Cards>
      )}
    </>
  );
}
