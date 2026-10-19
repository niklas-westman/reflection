import { useNavigate } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import styled from 'styled-components';
import { useReleaseHistory } from '../../data/release-history';
import { describeRelease, type ReleaseEntry } from '../../model/release-history';

const Selects = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space.xs};

  label {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    font-size: ${({ theme }) => theme.font.xs};
    color: var(--muted);
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

// Two releases can read the same (a candidate and a copy of it); the bundle id tells them apart.
function labelsFor(releases: ReleaseEntry[]): Map<ReleaseEntry, string> {
  const base = releases.map((entry) => describeRelease(entry));
  return new Map(releases.map((entry, index) => [entry, base.filter((text) => text === base[index]).length > 1 && entry.kind === 'bundle' ? `${base[index]} (${entry.bundleId})` : (base[index] ?? '')]));
}

const valueOf = (entry: ReleaseEntry, projectId: string): string => (entry.kind === 'bundle' ? `bundle:${entry.bundleId}` : `archive:${projectId}/${entry.release}`);

export interface ReleasePickerProps {
  projectId: string;
  // `bundle:<id>` or `archive:<project>/<release>`, whichever is open now.
  current: string;
}

/**
 * Project and release, as two choices. A release that can be opened in full is a bundle; one that has left its
 * slot is a summary, labelled as such. Changing the release is a deliberate move, never a hidden filter.
 */
export function ReleasePicker({ projectId, current }: ReleasePickerProps): ReactNode {
  const navigate = useNavigate();
  const { history } = useReleaseHistory();
  const project = history?.projects.find((entry) => entry.id === projectId);
  if (!history || !project) {
    return null;
  }

  const open = (value: string): void => {
    if (value.startsWith('bundle:')) {
      void navigate({ to: '/bundles/$bundleId', params: { bundleId: value.slice('bundle:'.length) } });
      return;
    }
    const [projectKey, ...rest] = value.slice('archive:'.length).split('/');
    void navigate({ to: '/archive/$project/$release', params: { project: projectKey ?? '', release: rest.join('/') } });
  };
  const switchProject = (id: string): void => {
    const first = history.projects.find((entry) => entry.id === id)?.releases[0];
    if (first) open(valueOf(first, id));
  };

  if (history.projects.length <= 1 && project.releases.length <= 1) {
    return null;
  }
  const labels = labelsFor(project.releases);
  return (
    <Selects>
      {history.projects.length > 1 ? (
        <label>
          Project
          <select aria-label="Change project" value={projectId} onChange={(event) => switchProject(event.target.value)}>
            {history.projects.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {project.releases.length > 1 ? (
        <label>
          Release
          <select aria-label="Change release" value={current} onChange={(event) => open(event.target.value)}>
            {project.releases.map((entry) => (
              <option key={valueOf(entry, projectId)} value={valueOf(entry, projectId)}>
                {labels.get(entry)}
              </option>
            ))}
          </select>
        </label>
      ) : null}
    </Selects>
  );
}
