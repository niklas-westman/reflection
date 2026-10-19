import type { ReactNode } from 'react';
import styled from 'styled-components';
import type { CoverageSummary } from 'reflection-projection';
import type { ComparisonCounts } from '../../model/comparison-outcome';

const Panels = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.space.md};
`;

const Panel = styled.section`
  flex: 1 1 24rem;
  padding: ${({ theme }) => theme.space.sm} ${({ theme }) => theme.space.md} ${({ theme }) => theme.space.md};
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: ${({ theme }) => theme.radius.lg};

  h2 {
    margin: 0 0 ${({ theme }) => theme.space.sm};
    font-size: ${({ theme }) => theme.font.xs};
    font-weight: 550;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--muted);
  }
  dl {
    display: flex;
    flex-wrap: wrap;
    gap: ${({ theme }) => theme.space.xs} ${({ theme }) => theme.space.lg};
    margin: 0;
  }
`;

type Tone = 'neutral' | 'pass' | 'fail';

const TONE_COLORS: Record<Tone, string> = { neutral: 'var(--text)', pass: 'var(--pass)', fail: 'var(--fail)' };

const TileBox = styled.div<{ $tone: Tone; $major: boolean }>`
  display: flex;
  flex-direction: column-reverse;
  min-width: 4rem;

  dt {
    color: var(--muted);
    font-size: ${({ theme }) => theme.font.xs};
  }
  dd {
    margin: 0;
    font-size: ${({ $major }) => ($major ? '1.75rem' : '1.375rem')};
    line-height: 1.15;
    font-weight: 650;
    letter-spacing: -0.02em;
    color: ${({ $tone }) => TONE_COLORS[$tone]};
  }
  dd.unknown {
    font-size: ${({ theme }) => theme.font.md};
    font-weight: 500;
    letter-spacing: 0;
    color: var(--muted);
    padding-top: 0.25rem;
  }
`;

interface TileProps {
  label: string;
  value: number | null;
  tone?: Tone;
  major?: boolean;
}

// A bucket the provider has no concept of reads "Unknown". Zero would claim that nothing is in it.
function Tile({ label, value, tone = 'neutral', major = false }: TileProps): ReactNode {
  return (
    <TileBox $tone={value === null ? 'neutral' : tone} $major={major} title={value === null ? 'This provider does not report this' : undefined}>
      <dt>{label}</dt>
      {value === null ? <dd className="unknown">Unknown</dd> : <dd>{value}</dd>}
    </TileBox>
  );
}

export interface RequiredItemsPanelProps {
  items: CoverageSummary;
  // True when the provider lists only what ran, so the required count is a lower bound.
  lowerBound: boolean;
}

/** The required items in one unit. A bucket the provider has no concept of reads "Unknown". */
export function RequiredItemsPanel({ items, lowerBound }: RequiredItemsPanelProps): ReactNode {
  return (
    <Panel aria-label="Required items">
      <h2>Required items</h2>
      <dl>
        <Tile label={lowerBound ? 'Listed (lower bound)' : 'Required'} value={items.required} major />
        <Tile label="Proven" value={items.proven} tone="pass" />
        <Tile label="Failing" value={items.failing} tone={items.failing > 0 ? 'fail' : 'neutral'} />
        <Tile label="Needs design" value={items.needsDesign} />
        <Tile label="Not enrolled" value={items.notEnrolled} />
        {items.unknown > 0 ? <Tile label="Not proven" value={items.unknown} /> : null}
      </dl>
    </Panel>
  );
}

export interface SummaryGroupsProps {
  items: CoverageSummary;
  comparisons: ComparisonCounts;
  lowerBound: boolean;
}

/** Two panels with one unit each: required items, and comparisons. They are never shown as one ratio. */
export function SummaryGroups({ items, comparisons, lowerBound }: SummaryGroupsProps): ReactNode {
  return (
    <Panels aria-label="Summary">
      <RequiredItemsPanel items={items} lowerBound={lowerBound} />
      <Panel aria-label="Comparisons">
        <h2>Comparisons</h2>
        <dl>
          <Tile label="Executed" value={comparisons.executed} major />
          <Tile label="Passed" value={comparisons.passed} tone="pass" />
          <Tile label="Failed" value={comparisons.failed} tone={comparisons.failed > 0 ? 'fail' : 'neutral'} />
          {comparisons.notRun > 0 ? <Tile label="Not run" value={comparisons.notRun} /> : null}
        </dl>
      </Panel>
    </Panels>
  );
}
