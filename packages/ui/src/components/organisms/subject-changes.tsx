import type { ReactNode } from 'react';
import styled from 'styled-components';
import type { SubjectChange } from 'reflection-projection';
import { changedItems, describeItemCounts, ITEM_CHANGE_TEXT } from '../../model/changes-view';
import { Pill } from '../atoms/pill';
import { BeforeAfter, type BeforeAfterProps } from '../molecules/before-after';

const List = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(26rem, 1fr));
  gap: ${({ theme }) => theme.space.sm};

  li {
    padding: ${({ theme }) => theme.space.md};
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: ${({ theme }) => theme.radius.lg};
  }
  header {
    display: flex;
    justify-content: space-between;
    gap: ${({ theme }) => theme.space.xs};
    margin-bottom: ${({ theme }) => theme.space.xs};
  }
`;

const SHOWN = 12;

/** The changes inside one subject: each changed required item with its design reference before and after. */
export function SubjectChanges({ change, ...pair }: { change: SubjectChange } & Omit<BeforeAfterProps, 'item'>): ReactNode {
  const items = changedItems(change);
  if (items.length === 0) {
    return <p role="status">Nothing changed in this subject's required items or their design references since {pair.previousRelease}.</p>;
  }
  return (
    <>
      <p style={{ color: 'var(--muted)' }}>
        {describeItemCounts(change)} since {pair.previousRelease}. {change.counts.unchanged} {change.counts.unchanged === 1 ? 'item is' : 'items are'} unchanged. A change here is a change to what must be proven or to its design, not a pass or a fail.
      </p>
      <List aria-label="Changed required items">
        {items.slice(0, SHOWN).map((item) => (
          <li key={item.requirementId}>
            <header>
              <strong>{item.label}</strong>
              <Pill $tone="idle">{ITEM_CHANGE_TEXT[item.change]}</Pill>
            </header>
            <BeforeAfter item={item} {...pair} />
          </li>
        ))}
      </List>
      {items.length > SHOWN ? <p>and {items.length - SHOWN} more changed items</p> : null}
    </>
  );
}
