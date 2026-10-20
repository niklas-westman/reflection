import { Navigate, useNavigate, useParams, useRouter, useSearch } from '@tanstack/react-router';
import { useMemo, type ReactNode } from 'react';
import { useBundleView } from '../data/bundle-context';
import { ComparisonInspector } from '../components/organisms/comparison-inspector';
import { hasActiveFilters } from '../model/filters';
import { buildInspectorModel } from '../model/inspector-model';
import { parseInspectorSearch, toInspectorSearch, type InspectorView } from '../model/inspector-state';
import { buildMatrix } from '../model/matrix-model';
import { DEFAULT_SUBJECT_VIEW, parseSubjectSearch, toSubjectSearch } from '../model/search';
import { groupBySubject } from '../model/subject-model';
import { isSection, paths, sectionOf } from './paths';

/** The full comparison: the evidence large, the recorded measurements beside it, provenance and gaps below. */
export function ComparisonPage(): ReactNode {
  const { section, subjectId = '', comparisonId = '' } = useParams({ strict: false });
  const { bundleId, manifest, prepared } = useBundleView();
  const { projection } = prepared;
  const router = useRouter();
  const navigate = useNavigate();
  const raw = useSearch({ strict: false }) as Record<string, unknown>;
  const inspectorView = parseInspectorSearch(raw);
  const { filters } = parseSubjectSearch(raw);

  const subjects = useMemo(() => groupBySubject(projection), [projection]);
  const comparison = projection.comparisons.find((entry) => entry.id === comparisonId);
  // The comparison's own subject, which can differ from the one in a hand-edited address.
  const owner = comparison ? subjects.find((subject) => subject.comparisons.some((entry) => entry.id === comparison.id)) : undefined;
  const matrix = useMemo(() => (owner ? buildMatrix({ projection, subject: owner, unusableComparisonIds: prepared.unusableComparisonIds, supersededComparisonIds: prepared.supersededComparisonIds }) : undefined), [projection, owner, prepared]);
  const model = useMemo(
    () => (matrix ? buildInspectorModel({ projection, matrix, filters, comparisonId, unusableComparisonIds: prepared.unusableComparisonIds, bundleHash: manifest.bundleHash, builtAt: manifest.release.builtAt, validity: prepared.validity, supersededComparisonIds: prepared.supersededComparisonIds, recordedComparisons: prepared.recordedComparisons }) : undefined),
    // The filters object is rebuilt on every render; its content is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [projection, matrix, JSON.stringify(filters), comparisonId, prepared, manifest.bundleHash]
  );

  if (!comparison || !owner || !model || !isSection(section)) {
    return (
      <>
        {isSection(section) ? (
          <p>
            <a href={paths.subject(bundleId, section === 'components' ? 'component' : 'page', subjectId)}>← {subjectId}</a>
          </p>
        ) : null}
        <p role="status">No comparison called “{comparisonId}” in this bundle.</p>
      </>
    );
  }
  // A comparison opened under another subject's address is sent to its own.
  if (owner.id !== subjectId || sectionOf(owner.kind) !== section) {
    return <Navigate to="/bundles/$bundleId/$section/$subjectId/comparisons/$comparisonId" params={{ bundleId, section: sectionOf(owner.kind), subjectId: owner.id, comparisonId }} search={raw as never} replace />;
  }

  // Filters and the inspector state travel with every link, so previous and next keep following the page the reader came from.
  const filterSearch = toSubjectSearch({ ...DEFAULT_SUBJECT_VIEW, filters });
  const carried = { ...filterSearch, ...toInspectorSearch(inspectorView) };
  const hrefOf = (id: string): string => paths.comparison(bundleId, owner.kind, owner.id, id, carried);
  const pathOf = (href: string): string => href.replace(/^#/, '');

  const onViewChange = (next: InspectorView): void => {
    void navigate({ to: '.', replace: true, search: { ...filterSearch, ...toInspectorSearch(next) } as never });
  };

  return (
    <ComparisonInspector
      model={model}
      view={inspectorView}
      onViewChange={onViewChange}
      subjectLabel={owner.id}
      offline={prepared.validity.state === 'offline'}
      onNavigate={(href) => router.history.push(pathOf(href))}
      hrefs={{
        subject: paths.subject(bundleId, owner.kind, owner.id) + (hasActiveFilters(filters) ? `?view=items&${new URLSearchParams(Object.entries(filterSearch).map(([key, value]) => [key, typeof value === 'string' ? value : JSON.stringify(value)])).toString()}` : ''),
        previous: model.sequence.previous ? hrefOf(model.sequence.previous) : undefined,
        next: model.sequence.next ? hrefOf(model.sequence.next) : undefined,
        sibling: hrefOf
      }}
    />
  );
}
