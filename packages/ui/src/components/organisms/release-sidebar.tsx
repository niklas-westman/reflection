import { useState, type ReactNode } from 'react';
import styled from 'styled-components';
import type { BundleManifest } from 'reflection-projection';
import { releaseStateLabel } from '../../model/format';
import type { SubjectGroup } from '../../model/subject-model';
import { paths, SECTION_TITLES, sectionOf, type Section } from '../../routes/paths';
import { Pill } from '../atoms/pill';
import { ReleasePicker } from './release-picker';

const Side = styled.nav`
  width: 15.5rem;
  flex: none;
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space.md};
  padding: ${({ theme }) => theme.space.md} ${({ theme }) => theme.space.sm};
  overflow: auto;
  background: var(--surface);
  border-right: 1px solid var(--border);
`;

const ReleaseCard = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space.xs};
  padding: ${({ theme }) => theme.space.sm};
  border: 1px solid var(--border);
  border-radius: ${({ theme }) => theme.radius.lg};
  background: var(--bg);

  .label {
    font-size: ${({ theme }) => theme.font.xs};
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--muted);
  }
  .name {
    font-weight: 650;
  }
  select {
    width: 100%;
    border: 1px solid var(--border-strong);
    border-radius: ${({ theme }) => theme.radius.md};
    background: var(--surface);
    color: var(--text);
    padding: 0.3125rem ${({ theme }) => theme.space.xs};
    font: inherit;
    font-size: ${({ theme }) => theme.font.sm};
  }
`;

const Group = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

const itemStyles = `
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  padding: 0.4375rem 0.625rem;
  border: 0;
  border-radius: 0.5rem;
  background: none;
  color: inherit;
  text-align: left;
  text-decoration: none;
`;

const NavItem = styled.a`
  ${itemStyles}
  &:hover {
    background: var(--surface-2);
  }
  &[aria-current='page'] {
    background: var(--accent-bg);
    color: var(--accent);
    font-weight: 600;
  }
  &[aria-disabled='true'] {
    color: var(--muted);
    cursor: not-allowed;
  }
  &[aria-disabled='true']:hover {
    background: none;
  }
`;

const ParentButton = styled.button`
  ${itemStyles}
  cursor: pointer;
  &:hover {
    background: var(--surface-2);
  }
  .caret {
    margin-left: auto;
    color: var(--muted);
  }
  .count {
    color: var(--muted);
    font-size: 0.75rem;
  }
`;

const Children = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-left: ${({ theme }) => theme.space.sm};
  padding-left: ${({ theme }) => theme.space.xs};
  border-left: 1px solid var(--border);

  input {
    width: 100%;
    margin-bottom: ${({ theme }) => theme.space.xxs};
    border: 1px solid var(--border);
    background: var(--bg);
    color: var(--text);
    border-radius: ${({ theme }) => theme.radius.md};
    padding: 0.3125rem ${({ theme }) => theme.space.xs};
    font-size: ${({ theme }) => theme.font.sm};
  }
  small {
    padding: 0.25rem 0.625rem;
    color: var(--muted);
  }
`;

const Foot = styled.div`
  margin-top: auto;
  padding: ${({ theme }) => theme.space.xs};
  color: var(--muted);
  font-size: ${({ theme }) => theme.font.xs};
`;

export type NavLocation = { page: 'overview' } | { page: 'changes' } | { page: 'design-references' } | { page: 'subject'; section: Section; subjectId: string };

export interface ReleaseSidebarProps {
  bundleId: string;
  manifest: BundleManifest;
  subjects: SubjectGroup[];
  location: NavLocation;
}

/**
 * The one sidebar: which release, then Overview, Changes, one expandable Components list and one expandable
 * Pages list. The release stays visible on every route.
 */
export function ReleaseSidebar({ bundleId, manifest, subjects, location }: ReleaseSidebarProps): ReactNode {
  return (
    <Side aria-label="Release navigation">
      <ReleaseCardWithPicker bundleId={bundleId} manifest={manifest} />
      <Group>
        <NavItem href={paths.bundle(bundleId)} aria-current={location.page === 'overview' ? 'page' : undefined}>
          Overview
        </NavItem>
        <NavItem href={paths.changes(bundleId)} aria-current={location.page === 'changes' ? 'page' : undefined}>
          Changes
        </NavItem>
      </Group>
      {(['components', 'pages'] as const).map((section) => (
        <ExpandableSection key={section} bundleId={bundleId} section={section} subjects={subjects.filter((subject) => sectionOf(subject.kind) === section)} location={location} />
      ))}
      <Group>
        <NavItem href={paths.designReferences(bundleId)} aria-current={location.page === 'design-references' ? 'page' : undefined}>
          Design references
        </NavItem>
      </Group>
      <Foot>Read-only evidence viewer</Foot>
    </Side>
  );
}

function ReleaseCardWithPicker({ bundleId, manifest }: { bundleId: string; manifest: BundleManifest }): ReactNode {
  return (
    <ReleaseCard>
      <span className="label">Release</span>
      <span className="name">{manifest.project.name}</span>
      <span>
        {manifest.release.release} · build {manifest.release.build}{' '}
        <Pill $tone={manifest.release.state === 'released' ? 'pass' : 'gap'}>{releaseStateLabel(manifest.release.state)}</Pill>
      </span>
      <ReleasePicker projectId={manifest.project.id} current={`bundle:${bundleId}`} />
    </ReleaseCard>
  );
}

function ExpandableSection({ bundleId, section, subjects, location }: { bundleId: string; section: Section; subjects: SubjectGroup[]; location: NavLocation }): ReactNode {
  const containsCurrent = location.page === 'subject' && location.section === section;
  const [toggled, setToggled] = useState<boolean | undefined>(undefined);
  const [query, setQuery] = useState('');
  const open = toggled ?? containsCurrent;
  const shown = subjects.filter((subject) => `${subject.id} ${subject.label}`.toLowerCase().includes(query.trim().toLowerCase()));

  if (subjects.length === 0) {
    return null;
  }
  return (
    <Group>
      <ParentButton type="button" aria-expanded={open} onClick={() => setToggled(!open)}>
        {SECTION_TITLES[section]} <span className="count">{subjects.length}</span>
        <span className="caret" aria-hidden="true">
          {open ? '▾' : '▸'}
        </span>
      </ParentButton>
      {open ? (
        <Children>
          <input type="search" placeholder={`Search ${SECTION_TITLES[section].toLowerCase()}`} aria-label={`Search ${SECTION_TITLES[section].toLowerCase()}`} value={query} onChange={(event) => setQuery(event.target.value)} />
          {shown.map((subject) => (
            <NavItem key={subject.id} href={paths.subject(bundleId, subject.kind, subject.id)} aria-current={location.page === 'subject' && location.subjectId === subject.id ? 'page' : undefined}>
              {subject.label}
            </NavItem>
          ))}
          {shown.length === 0 ? <small>No {SECTION_TITLES[section].toLowerCase()} match.</small> : null}
        </Children>
      ) : null}
    </Group>
  );
}
