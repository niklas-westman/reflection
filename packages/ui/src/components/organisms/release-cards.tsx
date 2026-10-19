import type { ReactNode } from 'react';
import styled from 'styled-components';
import type { Delta } from 'reflection-projection';
import type { AttentionItem, AttentionKind } from '../../model/attention';
import { paths } from '../../routes/paths';

const Card = styled.section`
  padding: ${({ theme }) => theme.space.md};
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: ${({ theme }) => theme.radius.lg};

  h2 {
    margin: 0 0 ${({ theme }) => theme.space.sm};
    font-size: ${({ theme }) => theme.font.md};
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: ${({ theme }) => theme.space.sm};
  }
  .muted {
    color: var(--muted);
    font-size: ${({ theme }) => theme.font.sm};
  }
  .in {
    color: var(--muted);
    font-size: ${({ theme }) => theme.font.sm};
  }
  .in a {
    margin-right: ${({ theme }) => theme.space.xs};
  }
`;

const Row = styled.div`
  display: flex;
  justify-content: space-between;
  gap: ${({ theme }) => theme.space.md};
  padding: 0.125rem 0;

  b {
    font-variant-numeric: tabular-nums;
  }
  .fail {
    color: var(--fail);
  }
`;

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

const ATTENTION_TEXT: Record<AttentionKind, { title: (count: number) => string; detail: string }> = {
  failures: { title: (count) => `${plural(count, 'comparison failure', 'comparison failures')}`, detail: 'A required comparison did not pass.' },
  'unusable-evidence': { title: (count) => `${plural(count, 'comparison has', 'comparisons have')} unusable evidence`, detail: 'Counted as unknown until the files are restored.' },
  'needs-design': { title: (count) => `${plural(count, 'required item needs', 'required items need')} a design selection`, detail: 'No design has been chosen to compare against.' },
  'not-enrolled': { title: (count) => `${plural(count, 'required item is', 'required items are')} not enrolled`, detail: 'No comparison is set up for it yet.' },
  'not-proven': { title: (count) => `${plural(count, 'required item', 'required items')} not proven`, detail: 'Not every required proof has run.' },
  'unconfirmed-references': { title: (count) => `${plural(count, 'reference approval', 'reference approvals')} not confirmed by a person`, detail: 'Recorded by an agent, or no longer matching the current reference.' }
};

const SHOWN_SUBJECTS = 4;

export function AttentionCard({ bundleId, items }: { bundleId: string; items: AttentionItem[] }): ReactNode {
  return (
    <Card aria-label="Needs attention">
      <h2>Needs attention</h2>
      {items.length === 0 ? (
        <p className="muted">No failures, missing items or unusable evidence were recorded in this bundle.</p>
      ) : (
        <ul>
          {items.map((item) => (
            <li key={item.kind}>
              <strong>{ATTENTION_TEXT[item.kind].title(item.count)}</strong>
              <div className="muted">{ATTENTION_TEXT[item.kind].detail}</div>
              <div className="in">
                In{' '}
                {item.subjects.slice(0, SHOWN_SUBJECTS).map((subject) => (
                  <a key={subject.id} href={paths.subject(bundleId, subject.kind, subject.id, item.outcome ? { outcome: item.outcome } : {})}>
                    {subject.id}
                  </a>
                ))}
                {item.subjects.length > SHOWN_SUBJECTS ? `and ${item.subjects.length - SHOWN_SUBJECTS} more` : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** What differs from the previous release, only as recorded in the delta. Added and removed components are not guessed. */
export function ChangesCard({ delta }: { delta: Delta & { against: string } }): ReactNode {
  const rows: Array<{ label: string; count: number; tone?: 'fail' }> = [
    { label: 'Regressed', count: delta.regressed.length, tone: 'fail' },
    { label: 'Fixed', count: delta.fixed.length },
    { label: 'Still failing', count: delta.stillFailing.length, tone: 'fail' },
    { label: 'Newly enrolled', count: delta.newlyEnrolled.length },
    { label: 'New in the design source', count: delta.newInDesign.length },
    { label: 'Removed from the design source', count: delta.removedInDesign.length }
  ];

  return (
    <Card aria-label="Changes since the previous release">
      <h2>Since {delta.against}</h2>
      {rows.map((row) => (
        <Row key={row.label}>
          <span>{row.label}</span>
          <b className={row.tone === 'fail' && row.count > 0 ? 'fail' : undefined}>{row.count}</b>
        </Row>
      ))}
      <p className="muted">{delta.sameSnapshot ? `Same design snapshot as ${delta.against}.` : `A newer design snapshot than ${delta.against}.`}</p>
    </Card>
  );
}
