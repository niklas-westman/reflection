import type { ReactNode } from 'react';
import styled from 'styled-components';
import type { CoverageSummary } from 'reflection-projection';

const Track = styled.div`
  display: flex;
  height: 0.5rem;
  border-radius: ${({ theme }) => theme.radius.pill};
  overflow: hidden;
  background: var(--border);
`;

const Segment = styled.i<{ $fill: string; $grow: number }>`
  display: block;
  flex: ${({ $grow }) => $grow} 0 0;
  background: ${({ $fill }) => $fill};
`;

const Legend = styled.ul`
  display: flex;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.space.xs} ${({ theme }) => theme.space.md};
  margin: ${({ theme }) => theme.space.xs} 0 0;
  padding: 0;
  list-style: none;
  font-size: ${({ theme }) => theme.font.xs};
  color: var(--muted);

  li::before {
    content: '';
    display: inline-block;
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 99px;
    margin-right: 0.375rem;
    background: var(--swatch);
  }
`;

interface Part {
  label: string;
  value: number;
  fill: string;
}

/** The required items as scope, with the required count as the denominator. It is not a compliance percentage. */
export function CoverageBar({ summary, compact = false }: { summary: CoverageSummary; compact?: boolean }): ReactNode {
  const parts: Part[] = [
    { label: 'Proven', value: summary.proven, fill: 'var(--bar-pass)' },
    { label: 'Failing', value: summary.failing, fill: 'var(--bar-fail)' },
    { label: 'Needs design or not enrolled', value: (summary.needsDesign ?? 0) + (summary.notEnrolled ?? 0), fill: 'var(--border-strong)' },
    { label: 'Not proven', value: summary.unknown, fill: 'repeating-linear-gradient(45deg, var(--idle) 0 3px, var(--surface) 3px 6px)' }
  ].filter((part) => part.value > 0);

  return (
    <div>
      <Track role="img" aria-label={`${summary.required} required items: ${parts.map((part) => `${part.value} ${part.label.toLowerCase()}`).join(', ')}`}>
        {parts.map((part) => (
          <Segment key={part.label} $fill={part.fill} $grow={part.value} />
        ))}
      </Track>
      {compact ? null : <Legend>
        {parts.map((part) => (
          <li key={part.label} style={{ ['--swatch' as string]: part.fill }}>
            {part.label} {part.value}
          </li>
        ))}
      </Legend>}
    </div>
  );
}
