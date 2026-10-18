import type { ReactNode } from 'react';
import styled from 'styled-components';
import type { CoverageSummary } from 'reflection-projection';
import type { ComparisonCounts } from '../../model/comparison-outcome';

const Groups = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.space.sm} ${({ theme }) => theme.space.xl};

  dl {
    margin: 0;
    display: flex;
    flex-wrap: wrap;
    gap: ${({ theme }) => theme.space.xs} ${({ theme }) => theme.space.md};
    align-items: baseline;
  }
  dt {
    color: var(--muted);
    font-size: ${({ theme }) => theme.font.xs};
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  dd {
    margin: 0;
  }
  b {
    font-weight: 650;
  }
`;

const Unknown = styled.span`
  color: var(--muted);
`;

/** A bucket the provider has no concept of is shown as unknown. Zero would claim that nothing is in it. */
function Bucket({ value, label }: { value: number | null; label: string }): ReactNode {
  return value === null ? (
    <span title="This provider does not report this">
      <Unknown>unknown</Unknown> {label}
    </span>
  ) : (
    <span>
      <b>{value}</b> {label}
    </span>
  );
}

export interface SummaryGroupsProps {
  items: CoverageSummary;
  comparisons: ComparisonCounts;
  // True when the provider lists only what ran, so the required count is a lower bound.
  lowerBound: boolean;
}

/** Two groups with one unit each: required items, and comparisons. They are never shown as one ratio. */
export function SummaryGroups({ items, comparisons, lowerBound }: SummaryGroupsProps): ReactNode {
  return (
    <Groups aria-label="Summary">
      <dl>
        <dt>Required items</dt>
        <dd>
          <b>{items.required}</b> {lowerBound ? 'listed (lower bound)' : 'required'} · <b>{items.proven}</b> proven · <b>{items.failing}</b> failing
          {' · '}
          <Bucket value={items.needsDesign} label="needs design" />
          {' · '}
          <Bucket value={items.notEnrolled} label="not enrolled" />
          {items.unknown > 0 ? (
            <>
              {' · '}
              <b>{items.unknown}</b> not proven
            </>
          ) : null}
        </dd>
      </dl>
      <dl>
        <dt>Comparisons</dt>
        <dd>
          <b>{comparisons.executed}</b> executed · <b>{comparisons.passed}</b> passed · <b>{comparisons.failed}</b> failed
          {comparisons.notRun > 0 ? (
            <>
              {' · '}
              <b>{comparisons.notRun}</b> not run
            </>
          ) : null}
        </dd>
      </dl>
    </Groups>
  );
}
