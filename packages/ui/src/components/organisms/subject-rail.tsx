import { useState, type ReactNode } from 'react';
import styled from 'styled-components';
import type { SubjectGroup } from '../../model/subject-model';
import { paths } from '../../routes/paths';

const Rail = styled.aside`
  width: 14.5rem;
  flex: none;
  border-right: 1px solid var(--border);
  background: var(--surface);
  padding: ${({ theme }) => theme.space.sm};
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space.xs};

  input {
    width: 100%;
    border: 1px solid var(--border);
    background: var(--bg);
    color: var(--text);
    border-radius: ${({ theme }) => theme.radius.md};
    padding: 0.4375rem ${({ theme }) => theme.space.sm};
  }
`;

const Item = styled.a`
  display: block;
  padding: ${({ theme }) => theme.space.xs} ${({ theme }) => theme.space.sm};
  border-radius: ${({ theme }) => theme.radius.md};
  color: inherit;
  text-decoration: none;

  &:hover {
    background: var(--surface-2);
  }
  &[aria-current='page'] {
    background: var(--accent-bg);
  }
  b {
    font-weight: 600;
  }
  small {
    display: block;
    color: var(--muted);
    font-size: ${({ theme }) => theme.font.xs};
  }
  .failing {
    color: var(--fail);
    font-weight: 600;
  }
`;

export function SubjectRail({ bundleId, subjects, currentId }: { bundleId: string; subjects: SubjectGroup[]; currentId: string | undefined }): ReactNode {
  const [query, setQuery] = useState('');
  const shown = subjects.filter((subject) => subject.id.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <Rail aria-label="Subjects">
      <input type="search" placeholder="Search" aria-label="Search subjects" value={query} onChange={(event) => setQuery(event.target.value)} />
      {shown.map((subject) => {
        const missing = (subject.summary.needsDesign ?? 0) + (subject.summary.notEnrolled ?? 0);
        return (
          <Item key={subject.id} href={paths.subject(bundleId, subject.id)} aria-current={subject.id === currentId ? 'page' : undefined}>
            <b>{subject.id}</b>
            <small>
              {subject.summary.failing > 0 ? <span className="failing">{subject.summary.failing} failing</span> : <span>0 failing</span>}
              {' · '}
              {subject.summary.required} required{missing > 0 ? ` · ${missing} missing` : ''}
            </small>
          </Item>
        );
      })}
      {shown.length === 0 ? <small>No subject matches.</small> : null}
    </Rail>
  );
}
