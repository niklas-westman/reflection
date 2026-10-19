import type { ReactNode } from 'react';
import styled from 'styled-components';
import type { SubjectGroup } from '../../model/subject-model';
import { CoverageBar } from './coverage-bar';

const Card = styled.a`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space.xs};
  padding: ${({ theme }) => theme.space.md};
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: ${({ theme }) => theme.radius.lg};
  color: inherit;
  text-decoration: none;

  &:hover {
    border-color: var(--border-strong);
  }
  h3 {
    margin: 0;
    font-size: ${({ theme }) => theme.font.lg};
  }
  .coverage {
    font-size: ${({ theme }) => theme.font.md};
  }
  .detail {
    color: var(--muted);
    font-size: ${({ theme }) => theme.font.xs};
    min-height: 1.1em;
  }
  .failing {
    color: var(--fail);
    font-weight: 600;
  }
`;

/**
 * One line of coverage, in required items only: proven of required, then failing and unresolved. Comparison
 * totals are not repeated here. A bucket the provider does not report is left out, never shown as zero.
 */
export function SubjectCard({ subject, href }: { subject: SubjectGroup; href: string }): ReactNode {
  const { summary } = subject;
  const unresolved = summary.required - summary.proven - summary.failing;
  const breakdown = [
    summary.needsDesign ? `${summary.needsDesign} need design` : undefined,
    summary.notEnrolled ? `${summary.notEnrolled} not enrolled` : undefined,
    summary.unknown ? `${summary.unknown} not proven` : undefined
  ].filter(Boolean);

  return (
    <Card href={href}>
      <h3>{subject.id}</h3>
      <div className="coverage">
        <strong>{summary.proven}</strong> proven of <strong>{summary.required}</strong> required
      </div>
      <div>
        <span className={summary.failing > 0 ? 'failing' : undefined}>{summary.failing} failing</span> · {unresolved} unresolved
      </div>
      <div className="detail">{breakdown.join(' · ')}</div>
      <CoverageBar summary={summary} compact />
    </Card>
  );
}
