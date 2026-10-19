import type { ReactNode } from 'react';
import styled from 'styled-components';
import type { ChangeKind } from 'reflection-projection';
import type { SubjectGroup } from '../../model/subject-model';
import { Pill } from '../atoms/pill';
import { CoverageBar } from './coverage-bar';

const BADGE_TEXT: Record<ChangeKind, string> = { added: 'Added', updated: 'Updated', removed: 'Removed', unchanged: 'Unchanged' };

// Whether the catalog changed since the previous release. Not a verification result, and never coloured as one.
export function ChangeBadge({ change }: { change: ChangeKind }): ReactNode {
  return <Pill $tone="idle">{BADGE_TEXT[change]}</Pill>;
}

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
  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: ${({ theme }) => theme.space.xs};
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
export function SubjectCard({ subject, href, change }: { subject: SubjectGroup; href: string; change?: ChangeKind | undefined }): ReactNode {
  const { summary } = subject;
  const unresolved = summary.required - summary.proven - summary.failing;
  const breakdown = [
    summary.needsDesign ? `${summary.needsDesign} need design` : undefined,
    summary.notEnrolled ? `${summary.notEnrolled} not enrolled` : undefined,
    summary.unknown ? `${summary.unknown} not proven` : undefined
  ].filter(Boolean);

  return (
    <Card href={href}>
      <header>
        <h3>{subject.label}</h3>
        {change ? <ChangeBadge change={change} /> : null}
      </header>
      {subject.description ? <div className="detail">{subject.description}</div> : null}
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
