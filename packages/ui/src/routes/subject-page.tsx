import { Navigate, useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { useMemo, type ReactNode } from 'react';
import styled from 'styled-components';
import type { Projection } from 'reflection-projection';
import { useBundleView } from '../data/bundle-context';
import { Pill } from '../components/atoms/pill';
import { Spacer } from '../components/atoms/spacer';
import { CoverageBar } from '../components/molecules/coverage-bar';
import { FilterBar, type Density } from '../components/molecules/filter-bar';
import { SummaryGroups } from '../components/molecules/summary-groups';
import { MatrixTable } from '../components/organisms/matrix-table';
import { EvidenceNotice } from '../components/organisms/evidence-notice';
import { availableDimensions, filterMatrix, hasActiveFilters, type MatrixFilters } from '../model/filters';
import { formatDate } from '../model/format';
import { buildMatrix } from '../model/matrix-model';
import { parseSubjectSearch, toSubjectSearch } from '../model/search';
import { groupBySubject, type SubjectGroup } from '../model/subject-model';
import { isSection, paths, sectionOf } from './paths';

const Title = styled.div`
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.space.sm};

  h1 {
    margin: 0;
    font-size: ${({ theme }) => theme.font.xl};
    letter-spacing: -0.02em;
    font-weight: 650;
  }
  .kind {
    color: var(--muted);
    font-size: ${({ theme }) => theme.font.sm};
  }
`;

// Where the evidence came from, as labelled facts rather than a sentence.
const Provenance = styled.dl`
  display: flex;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.space.xs} ${({ theme }) => theme.space.xl};
  margin: ${({ theme }) => theme.space.sm} 0 0;

  div {
    min-width: 0;
  }
  dt {
    color: var(--muted);
    font-size: ${({ theme }) => theme.font.xs};
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  dd {
    margin: 0.125rem 0 0;
    font-size: ${({ theme }) => theme.font.sm};
  }
`;

const Empty = styled.div`
  padding: ${({ theme }) => theme.space.xl};
  text-align: center;
  color: var(--muted);
  border: 1px dashed var(--border-strong);
  border-radius: ${({ theme }) => theme.radius.lg};
`;

export function SubjectPage(): ReactNode {
  const { section, subjectId = '' } = useParams({ strict: false });
  const { bundleId, prepared, manifest } = useBundleView();
  const subject = useMemo(() => groupBySubject(prepared.projection).find((group) => group.id === subjectId), [prepared, subjectId]);

  if (!subject || !isSection(section)) {
    return (
      <Empty role="status">
        <strong>No subject called “{subjectId}” in this bundle.</strong>
        <p>Pick one from the list on the left.</p>
        <p>{manifest.project.name} {manifest.release.release}</p>
      </Empty>
    );
  }
  // A page opened under /components (or the other way round) is sent to where it really lives.
  if (sectionOf(subject.kind) !== section) {
    return <Navigate to="/bundles/$bundleId/$section/$subjectId" params={{ bundleId, section: sectionOf(subject.kind), subjectId: subject.id }} replace />;
  }
  return <SubjectView subject={subject} />;
}

function SubjectView({ subject }: { subject: SubjectGroup }): ReactNode {
  const { bundleId, prepared, manifest } = useBundleView();
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
        <span className="kind">{subject.kind === 'component' ? 'Component' : 'Page'}</span>
        <Pill $tone={manifest.release.state === 'released' ? 'pass' : 'gap'}>{manifest.release.state === 'released' ? 'Released' : 'Candidate'}</Pill>
      </Title>
      <Provenance aria-label="Provenance">
        {describeSources(projection, subject).map((fact) => (
          <div key={fact.label}>
            <dt>{fact.label}</dt>
            <dd>{fact.value}</dd>
          </div>
        ))}
      </Provenance>
      <Spacer />
      <EvidenceNotice />
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
        <MatrixTable matrix={filtered} comparisonHref={(comparisonId) => paths.comparison(bundleId, subject.kind, subject.id, comparisonId)} density={view.density} filtersActive={filtersActive} />
      )}
    </>
  );
}

interface Fact {
  label: string;
  value: string;
}

// Which design data the proof actually read, with its own date, and the run that produced it.
function describeSources(projection: Projection, subject: SubjectGroup): Fact[] {
  const snapshotIds = new Set(subject.comparisons.flatMap((comparison) => (comparison.snapshotId ? [comparison.snapshotId] : [])));
  const snapshots = projection.snapshots.filter((snapshot) => snapshotIds.has(snapshot.id));
  const runIds = new Set(subject.comparisons.flatMap((comparison) => (comparison.runId ? [comparison.runId] : [])));
  const runs = projection.runs.filter((run) => runIds.has(run.id));

  const facts: Fact[] = [];
  if (snapshots.length > 0) {
    facts.push({ label: 'Proof based on', value: snapshots.map((snapshot) => `${snapshot.label ?? snapshot.role}, captured ${formatDate(snapshot.capturedAt)}`).join('; ') });
  }
  if (runs.length === 1 && runs[0]) {
    facts.push({ label: 'Run', value: `${formatDate(runs[0].finishedAt)} · ${runs[0].engine.name}${runs[0].engine.version ? ` ${runs[0].engine.version}` : ''}` });
  } else if (runs.length > 1) {
    facts.push({ label: 'Runs', value: `${runs.length} runs` });
  }
  return facts.length > 0 ? facts : [{ label: 'Proof based on', value: 'No source or run is recorded for this subject' }];
}
