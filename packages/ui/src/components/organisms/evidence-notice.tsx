import type { ReactNode } from 'react';
import { useBundleView } from '../../data/bundle-context';
import { Banner } from '../molecules/banner';

/** At most one banner, and only when something needs attention. */
export function EvidenceNotice(): ReactNode {
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
