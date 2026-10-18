import { useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { useMemo, type ReactNode } from 'react';
import styled from 'styled-components';
import type { Projection } from 'reflection-projection';
import { useBundleView } from '../data/bundle-context';
import { Pill } from '../components/atoms/pill';
import { Spacer } from '../components/atoms/spacer';
import { Banner } from '../components/molecules/banner';
import { CoverageBar } from '../components/molecules/coverage-bar';
import { FilterBar, type Density } from '../components/molecules/filter-bar';
import { SummaryGroups } from '../components/molecules/summary-groups';
import { MatrixTable } from '../components/organisms/matrix-table';
import { ValidityPill } from '../components/organisms/validity-pill';
import { availableDimensions, filterMatrix, hasActiveFilters, type MatrixFilters } from '../model/filters';
import { formatDate } from '../model/format';
import { buildMatrix } from '../model/matrix-model';
import { parseSubjectSearch, toSubjectSearch } from '../model/search';
import { groupBySubject, type SubjectGroup } from '../model/subject-model';

const Title = styled.div`
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.space.sm};

  h1 {
    margin: 0;
    font-size: ${({ theme }) => theme.font.xl};
    letter-spacing: -0.02em;
    font-weight: 650;
  }
`;

const Meta = styled.p`
  margin: ${({ theme }) => theme.space.xxs} 0 0;
  color: var(--muted);
  font-size: ${({ theme }) => theme.font.sm};
`;

const Empty = styled.div`
  padding: ${({ theme }) => theme.space.xl};
  text-align: center;
  color: var(--muted);
  border: 1px dashed var(--border-strong);
  border-radius: ${({ theme }) => theme.radius.lg};
`;

export function SubjectPage(): ReactNode {
  const { subjectId = '' } = useParams({ strict: false });
  const { prepared, manifest } = useBundleView();
  const subject = useMemo(() => groupBySubject(prepared.projection).find((group) => group.id === subjectId), [prepared, subjectId]);

  if (!subject) {
    return (
      <Empty role="status">
        <strong>No subject called “{subjectId}” in this bundle.</strong>
        <p>Pick one from the list on the left.</p>
        <p>{manifest.project.name} {manifest.release.release}</p>
      </Empty>
    );
  }
  return <SubjectView subject={subject} />;
}

function SubjectView({ subject }: { subject: SubjectGroup }): ReactNode {
  const { prepared, manifest, verifying } = useBundleView();
  const { projection } = prepared;
  const navigate = useNavigate();
  const view = parseSubjectSearch(useSearch({ strict: false }) as Record<string, unknown>);

  const matrix = useMemo(() => buildMatrix({ projection, subject, unusableComparisonIds: prepared.unusableComparisonIds }), [projection, subject, prepared]);
  const filtered = useMemo(() => filterMatrix(matrix, view.filters), [matrix, view.filters]);
  const dimensions = useMemo(() => availableDimensions(matrix), [matrix]);
  const shown = filtered.groups.reduce((sum, group) => sum + group.rows.length, 0);
  const total = subject.requirements.length;
  const filtersActive = hasActiveFilters(view.filters);

  const update = (next: { filters?: MatrixFilters; density?: Density }): void => {
    void navigate({ to: '.', replace: true, search: toSubjectSearch({ filters: next.filters ?? view.filters, density: next.density ?? view.density }) as never });
  };

  return (
    <>
      <Title>
        <h1>{subject.id}</h1>
        <Pill $tone="idle">{subject.kind === 'component' ? 'Component' : 'Page'}</Pill>
        <Pill $tone={manifest.release.state === 'released' ? 'pass' : 'gap'}>{manifest.release.state === 'released' ? 'Released' : 'Candidate'}</Pill>
        <ValidityPill validity={prepared.validity} verifying={verifying} />
      </Title>
      <Meta>{describeSources(projection, subject)}</Meta>
      <Spacer $size="sm" />
      <Notice />
      <Spacer $size="sm" />
      <SummaryGroups items={subject.summary} comparisons={subject.comparisonCounts} lowerBound={projection.inventory === 'executed-only'} />
      <Spacer $size="sm" />
      <CoverageBar summary={subject.summary} />
      <Spacer />
      <FilterBar
        filters={view.filters}
        onFiltersChange={(filters) => update({ filters })}
        dimensions={dimensions}
        density={view.density}
        onDensityChange={(density) => update({ density })}
        shown={shown}
        total={total}
      />
      <Spacer $size="sm" />
      {total === 0 ? (
        <Empty>This subject has comparisons but no required items. They are listed in the data but not counted against anything.</Empty>
      ) : shown === 0 ? (
        <Empty role="status">
          <strong>No items match these filters.</strong>
          <p>
            All {total} items are still counted above.{' '}
            <button type="button" onClick={() => update({ filters: { search: '', outcomes: [], dimensions: {} } })}>
              Clear filters
            </button>
          </p>
        </Empty>
      ) : (
        <MatrixTable matrix={filtered} subjectId={subject.id} density={view.density} filtersActive={filtersActive} />
      )}
    </>
  );
}

// At most one banner, and only when something needs attention.
function Notice(): ReactNode {
  const { prepared } = useBundleView();
  if (prepared.validity.state === 'invalid') {
    const shown = prepared.problems.slice(0, 3);
    return (
      <Banner tone="fail" title={`Some evidence in this bundle is unusable (${prepared.problems.length})`}>
        <p style={{ margin: '0.25rem 0 0' }}>Affected comparisons are counted as unknown, not as passed or failed.</p>
        <ul>
          {shown.map((problem, index) => (
            <li key={index}>
              {problem.path ? <code>{problem.path}</code> : null} {problem.message}
            </li>
          ))}
          {prepared.problems.length > shown.length ? <li>and {prepared.problems.length - shown.length} more</li> : null}
        </ul>
      </Banner>
    );
  }
  if (prepared.projection.inventory === 'executed-only') {
    return (
      <Banner tone="gap" title="Only checks that ran are listed">
        <p style={{ margin: '0.25rem 0 0' }}>This provider cannot declare required items, so anything that did not run is not visible here and the counts are a lower bound.</p>
      </Banner>
    );
  }
  return null;
}

// Which design data the proof actually read, with its own date, and the run that produced it.
function describeSources(projection: Projection, subject: SubjectGroup): string {
  const snapshotIds = new Set(subject.comparisons.flatMap((comparison) => (comparison.snapshotId ? [comparison.snapshotId] : [])));
  const snapshots = projection.snapshots.filter((snapshot) => snapshotIds.has(snapshot.id));
  const runIds = new Set(subject.comparisons.flatMap((comparison) => (comparison.runId ? [comparison.runId] : [])));
  const runs = projection.runs.filter((run) => runIds.has(run.id));

  const parts: string[] = [];
  if (snapshots.length > 0) {
    parts.push(`Proof based on ${snapshots.map((snapshot) => `${snapshot.label ?? snapshot.role}, captured ${formatDate(snapshot.capturedAt)}`).join('; ')}`);
  }
  if (runs.length === 1 && runs[0]) {
    parts.push(`run finished ${formatDate(runs[0].finishedAt)} with ${runs[0].engine.name}${runs[0].engine.version ? ` ${runs[0].engine.version}` : ''}`);
  } else if (runs.length > 1) {
    parts.push(`${runs.length} runs`);
  }
  return parts.length > 0 ? parts.join(' · ') : 'No source or run is recorded for this subject.';
}
