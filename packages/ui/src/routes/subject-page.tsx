import { Navigate, useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { useMemo, type ReactNode } from 'react';
import styled from 'styled-components';
import type { Projection } from 'reflection-projection';
import { useBundleView } from '../data/bundle-context';
import { Button } from '../components/atoms/button';
import { ExternalLink } from '../components/atoms/external-link';
import { Pill } from '../components/atoms/pill';
import { Spacer } from '../components/atoms/spacer';
import { CoverageBar } from '../components/molecules/coverage-bar';
import { FilterBar, type Density } from '../components/molecules/filter-bar';
import { SummaryGroups } from '../components/molecules/summary-groups';
import { ItemGallery } from '../components/organisms/item-gallery';
import { MatrixTable } from '../components/organisms/matrix-table';
import { PageChecks } from '../components/organisms/page-checks';
import { Banner } from '../components/molecules/banner';
import { ViewSwitcher } from '../components/molecules/view-switcher';
import { SubjectChanges } from '../components/organisms/subject-changes';
import { useReleaseDiff, type ReleaseDiffState } from '../data/release-diff';
import { EvidenceNotice } from '../components/organisms/evidence-notice';
import { availableDimensions, filterMatrix, hasActiveFilters, type MatrixFilters } from '../model/filters';
import { formatDate } from '../model/format';
import { buildItemDetail, currentRow, dimensionChoices, orderedRows, pickRow, selectedColumns } from '../model/gallery-model';
import { buildMatrix } from '../model/matrix-model';
import { DEFAULT_SUBJECT_VIEW, parseSubjectSearch, toSubjectSearch, type SubjectView as SubjectViewState } from '../model/search';
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

const Description = styled.p`
  margin: ${({ theme }) => theme.space.xxs} 0 0;
  color: var(--muted);
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

  const diffState = useReleaseDiff();
  const matrix = useMemo(() => buildMatrix({ projection, subject, unusableComparisonIds: prepared.unusableComparisonIds }), [projection, subject, prepared]);
  const filtered = useMemo(() => filterMatrix(matrix, view.filters), [matrix, view.filters]);
  const dimensions = useMemo(() => availableDimensions(matrix), [matrix]);
  const shown = filtered.groups.reduce((sum, group) => sum + group.rows.length, 0);
  const total = subject.requirements.length;
  const filtersActive = hasActiveFilters(view.filters);

  const update = (next: Partial<SubjectViewState>): void => {
    void navigate({ to: '.', replace: true, search: toSubjectSearch({ ...view, ...next }) as never });
  };

  const rows = useMemo(() => orderedRows(matrix), [matrix]);
  const choices = useMemo(() => dimensionChoices(rows), [rows]);
  const row = currentRow(rows, view.item);
  const chosenColumns = selectedColumns(matrix.columns, view.adapters);
  const detail = useMemo(
    () => (row ? buildItemDetail({ row, projection, columns: chosenColumns, unusableComparisonIds: prepared.unusableComparisonIds }) : undefined),
    // chosenColumns is derived from the two values below, so they are the real inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [row, projection, matrix.columns, view.adapters, prepared]
  );

  const pickDimension = (name: string, value: string): void => {
    if (!row) return;
    const next = pickRow(rows, { ...row.dimensions, [name]: value }, name);
    if (next) update({ item: next.requirement.id });
  };

  return (
    <>
      <Title>
        <h1>{subject.label}</h1>
        <span className="kind">
          {subject.kind === 'component' ? 'Component' : 'Page'}
          {subject.label !== subject.id ? ` · ${subject.id}` : ''}
        </span>
        <Pill $tone={manifest.release.state === 'released' ? 'pass' : 'gap'}>{manifest.release.state === 'released' ? 'Released' : 'Candidate'}</Pill>
      </Title>
      {subject.description ? <Description>{subject.description}</Description> : null}
      <Provenance aria-label="Provenance">
        {describeSources(projection, subject).map((fact) => (
          <div key={fact.label}>
            <dt>{fact.label}</dt>
            <dd>{fact.value}</dd>
          </div>
        ))}
        {subject.sourceUrl ? (
          <div>
            <dt>Design source</dt>
            <dd>
              <ExternalLink href={subject.sourceUrl}>Open the design source</ExternalLink>
            </dd>
          </div>
        ) : null}
      </Provenance>
      <Spacer />
      <EvidenceNotice subject={subject} />
      <Spacer $size="sm" />
      <SummaryGroups items={subject.summary} comparisons={subject.comparisonCounts} lowerBound={projection.inventory === 'executed-only'} />
      <Spacer $size="sm" />
      <CoverageBar summary={subject.summary} />
      <Spacer />
      <ViewSwitcher mode={view.mode} onChange={(mode) => update({ mode })} changesUnavailable={changesUnavailableReason(diffState)} />
      <Spacer $size="sm" />
      {total === 0 ? (
        <Empty>This subject has comparisons but no required items. They are listed in the data but not counted against anything.</Empty>
      ) : view.mode === 'gallery' && detail ? (
        subject.kind === 'component' ? (
          <ItemGallery
            bundleId={bundleId}
            subject={{ id: subject.id, kind: subject.kind }}
            rows={rows}
            choices={choices}
            columns={matrix.columns}
            chosenColumns={chosenColumns}
            detail={detail}
            onPickDimension={pickDimension}
            onPickItem={(item) => update({ item })}
            onPickAdapters={(ids) => update({ adapters: ids.length === 0 ? undefined : ids })}
          />
        ) : (
          <PageChecks bundleId={bundleId} subject={{ id: subject.id, kind: subject.kind }} rows={rows} columns={matrix.columns} onShowAll={() => update({ mode: 'items' })} />
        )
      ) : view.mode === 'changes' ? (
        diffState.status === 'ready' ? (
          <SubjectChanges
            change={diffState.diff.subjects.find((entry) => entry.kind === subject.kind && entry.id === subject.id) ?? { id: subject.id, kind: subject.kind, change: 'unchanged', items: [], counts: { added: 0, removed: 0, referenceChanged: 0, unchanged: 0 } }}
            previousRelease={diffState.previousRelease}
            currentRelease={manifest.release.release}
            previousSource={diffState.previousSource}
          />
        ) : (
          <Banner tone="idle" title="Changes are not available">
            <p style={{ margin: '0.25rem 0 0' }}>{changesUnavailableReason(diffState)}</p>
          </Banner>
        )
      ) : (
        <>
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
          {shown === 0 ? (
            <Empty role="status">
              <strong>No items match these filters.</strong>
              <p>
                All {total} items are still counted above.{' '}
                <Button type="button" onClick={() => update({ filters: { search: '', outcomes: [], dimensions: {} } })}>
                  Clear filters
                </Button>
              </p>
            </Empty>
          ) : (
            <MatrixTable matrix={filtered} comparisonHref={(comparisonId) => paths.comparison(bundleId, subject.kind, subject.id, comparisonId, toSubjectSearch({ ...DEFAULT_SUBJECT_VIEW, filters: view.filters }))} density={view.density} filtersActive={filtersActive} />
          )}
        </>
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

function changesUnavailableReason(state: ReleaseDiffState): string | undefined {
  if (state.status === 'ready') return undefined;
  if (state.status === 'first-release') return 'This is the first release, so there is nothing to compare with.';
  if (state.status === 'loading') return 'Loading the previous release.';
  return `The previous release (${state.previousRelease}) is not available here.`;
}
