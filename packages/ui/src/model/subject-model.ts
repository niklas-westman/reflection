import { summarizeReadiness, type Comparison, type CoverageSummary, type Presentation, type Projection, type Requirement } from 'reflection-projection';
import { countComparisons, type ComparisonCounts } from './comparison-outcome';

/** What the rail lists. A subject is the unit a provider groups by: a component family, a page. */
export interface SubjectGroup {
  id: string;
  // The provider's label when it gave one, else the id. Addresses always use the id.
  label: string;
  description: string | undefined;
  sourceUrl: string | undefined;
  changeNote: string | undefined;
  // The provider's layout hint for the subject's items; undefined keeps the default layout.
  presentation: Presentation | undefined;
  kind: 'component' | 'page';
  requirements: Requirement[];
  comparisons: Comparison[];
  summary: CoverageSummary;
  comparisonCounts: ComparisonCounts;
}

export function groupBySubject(projection: Projection): SubjectGroup[] {
  const subjectOfRequirement = new Map(projection.requirements.map((requirement) => [requirement.id, requirement.subject]));
  const groups = new Map<string, { kind: 'component' | 'page'; requirements: Requirement[]; comparisons: Comparison[] }>();

  const groupFor = (id: string, kind: 'component' | 'page') => {
    const existing = groups.get(id);
    if (existing) {
      return existing;
    }
    const created = { kind, requirements: [] as Requirement[], comparisons: [] as Comparison[] };
    groups.set(id, created);
    return created;
  };

  for (const requirement of projection.requirements) {
    groupFor(requirement.subject.id, requirement.subject.kind).requirements.push(requirement);
  }
  for (const comparison of projection.comparisons) {
    const subject = (comparison.requirementId ? subjectOfRequirement.get(comparison.requirementId) : undefined) ?? comparison.subject;
    groupFor(subject.id, subject.kind).comparisons.push(comparison);
  }

  const concepts = projection.provider.readinessConcepts;
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, group]): SubjectGroup => {
      const info = projection.subjects.find((entry) => entry.id === id && entry.kind === group.kind);
      return {
        id,
        label: info?.label ?? id,
        description: info?.description,
        sourceUrl: info?.sourceUrl,
        changeNote: info?.changeNote,
        presentation: info?.presentation,
        kind: group.kind,
        requirements: group.requirements,
        comparisons: group.comparisons,
        summary: summarizeReadiness(group.requirements, group.comparisons, concepts),
        comparisonCounts: countComparisons(group.comparisons)
      };
    });
}
