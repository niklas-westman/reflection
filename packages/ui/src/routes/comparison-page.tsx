import { useParams } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { useBundleView } from '../data/bundle-context';
import { comparisonOutcome } from '../model/comparison-outcome';
import { isSection, paths } from './paths';

/** Placeholder until the comparison view is built: it resolves the comparison so cell links land somewhere true. */
export function ComparisonPage(): ReactNode {
  const { section, subjectId = '', comparisonId = '' } = useParams({ strict: false });
  const { bundleId, prepared } = useBundleView();
  const comparison = prepared.projection.comparisons.find((entry) => entry.id === comparisonId);
  const kind = section === 'components' ? 'component' : 'page';

  return (
    <>
      {isSection(section) ? (
        <p>
          <a href={paths.subject(bundleId, kind, subjectId)}>← {subjectId}</a>
        </p>
      ) : null}
      {comparison ? (
        <>
          <h1>{comparison.id}</h1>
          <p>Outcome: {comparisonOutcome(comparison)}. The full comparison view (reference, actual and diff, measurements and provenance) is a later step.</p>
        </>
      ) : (
        <p role="status">No comparison called “{comparisonId}” in this bundle.</p>
      )}
    </>
  );
}
