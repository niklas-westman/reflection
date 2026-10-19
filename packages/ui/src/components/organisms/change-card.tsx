import type { ReactNode } from 'react';
import styled from 'styled-components';
import type { SubjectChange } from 'reflection-projection';
import { changedItems, describeItemCounts, featuredItem, ITEM_CHANGE_TEXT } from '../../model/changes-view';
import type { SubjectGroup } from '../../model/subject-model';
import { Pill } from '../atoms/pill';
import { BeforeAfter, type BeforeAfterProps } from '../molecules/before-after';
import { ChangeBadge } from '../molecules/subject-card';

const Card = styled.article`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space.sm};
  padding: ${({ theme }) => theme.space.md};
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: ${({ theme }) => theme.radius.lg};
  min-width: 0;

  header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: ${({ theme }) => theme.space.xs};
  }
  h3 {
    margin: 0;
    font-size: ${({ theme }) => theme.font.lg};
  }
  .meta {
    color: var(--muted);
    font-size: ${({ theme }) => theme.font.sm};
  }
  ul {
    margin: ${({ theme }) => theme.space.xs} 0 0;
    padding-left: 1.1rem;
    font-size: ${({ theme }) => theme.font.sm};
  }
  summary {
    cursor: pointer;
    color: var(--muted);
    font-size: ${({ theme }) => theme.font.sm};
  }
`;

const SHOWN_ITEMS = 12;

export interface ChangeCardProps extends Omit<BeforeAfterProps, 'item'> {
  change: SubjectChange;
  label: string;
  // The subject as it is in this release, when it still exists. Absent for a removed subject.
  subject: SubjectGroup | undefined;
  href: string | undefined;
}

/** One subject whose catalog changed: what the provider says changed, the featured before and after, and the changed items. */
export function ChangeCard({ change, label, subject, href, ...pair }: ChangeCardProps): ReactNode {
  const featured = featuredItem(change);
  const items = changedItems(change);
  return (
    <Card aria-label={`${label}: ${change.change}`}>
      <header>
        <h3>{label}</h3>
        <ChangeBadge change={change.change} />
      </header>
      <div className="meta">
        {change.kind === 'component' ? 'Component' : 'Page'} · {describeItemCounts(change)}
      </div>
      {subject?.changeNote ? <p style={{ margin: 0 }}>{subject.changeNote}</p> : null}
      {featured ? <BeforeAfter item={featured} {...pair} /> : null}
      {items.length > 1 || (items.length === 1 && !featured) ? (
        <details>
          <summary>Show {items.length} changed items</summary>
          <ul>
            {items.slice(0, SHOWN_ITEMS).map((item) => (
              <li key={item.requirementId}>
                {item.label} <Pill $tone="idle">{ITEM_CHANGE_TEXT[item.change]}</Pill>
              </li>
            ))}
            {items.length > SHOWN_ITEMS ? <li>and {items.length - SHOWN_ITEMS} more</li> : null}
          </ul>
        </details>
      ) : null}
      {href ? <a href={href}>Inspect {label}</a> : <span className="meta">No longer part of this release</span>}
    </Card>
  );
}
