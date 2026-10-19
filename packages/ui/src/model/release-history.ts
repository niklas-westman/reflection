import type { ArchiveSummary, OpenBundleResult } from 'reflection-projection';
import { releaseStateLabel } from './format';

export interface BundleRelease {
  kind: 'bundle';
  bundleId: string;
  release: string;
  build: number;
  state: 'candidate' | 'released';
  builtAt: string;
}

export interface ArchivedRelease {
  kind: 'archive';
  release: string;
  build: number;
  finalState: ArchiveSummary['finalState'];
  removedAt: string;
  summary: ArchiveSummary;
}

export type ReleaseEntry = BundleRelease | ArchivedRelease;

export interface ProjectHistory {
  id: string;
  name: string;
  // Releases that can be opened in full first (newest first), then summaries (most recently removed first).
  releases: ReleaseEntry[];
}

export interface HistoryInput {
  bundles: Array<{ id: string; result: OpenBundleResult | undefined }>;
  archive: ArchiveSummary[];
}

export interface ReleaseHistory {
  projects: ProjectHistory[];
  // Bundles in the list that could not be opened at all, by id. They belong to no project.
  rejected: string[];
}

/** The releases the viewer knows about, per project: what can be opened in full, then what is only a summary. */
export function buildReleaseHistory({ bundles, archive }: HistoryInput): ReleaseHistory {
  const projects = new Map<string, { name: string; bundles: BundleRelease[]; archived: ArchivedRelease[] }>();
  const projectOf = (id: string, name: string) => {
    const existing = projects.get(id);
    if (existing) {
      if (name !== id && existing.name === id) existing.name = name;
      return existing;
    }
    const created = { name, bundles: [] as BundleRelease[], archived: [] as ArchivedRelease[] };
    projects.set(id, created);
    return created;
  };

  const rejected: string[] = [];
  for (const entry of bundles) {
    if (entry.result?.status === 'opened') {
      const { manifest } = entry.result.bundle;
      projectOf(manifest.project.id, manifest.project.name).bundles.push({
        kind: 'bundle',
        bundleId: entry.id,
        release: manifest.release.release,
        build: manifest.release.build,
        state: manifest.release.state,
        builtAt: manifest.release.builtAt
      });
    } else if (entry.result?.status === 'rejected') {
      rejected.push(entry.id);
    }
  }
  for (const summary of archive) {
    projectOf(summary.project, summary.project).archived.push({ kind: 'archive', release: summary.release, build: summary.build, finalState: summary.finalState, removedAt: summary.removed.at, summary });
  }

  return {
    projects: [...projects.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([id, project]) => ({
        id,
        name: project.name,
        releases: [...project.bundles.sort((a, b) => b.builtAt.localeCompare(a.builtAt)), ...project.archived.sort((a, b) => b.removedAt.localeCompare(a.removedAt))]
      })),
    rejected
  };
}

export function describeRelease(entry: ReleaseEntry): string {
  if (entry.kind === 'archive') {
    return `${entry.release} · build ${entry.build} · summary only`;
  }
  return `${entry.release} · build ${entry.build} · ${releaseStateLabel(entry.state)}`;
}
