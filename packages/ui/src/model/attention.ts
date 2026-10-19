import type { Projection } from 'reflection-projection';
import type { OutcomeGroupId } from './matrix-model';
import type { SubjectGroup } from './subject-model';

export type AttentionKind = 'failures' | 'unusable-evidence' | 'needs-design' | 'not-enrolled' | 'not-proven' | 'unconfirmed-references';

export interface AttentionSubject {
  id: string;
  label: string;
  kind: SubjectGroup['kind'];
}

export interface AttentionItem {
  kind: AttentionKind;
  // In the unit of the kind: comparisons for failures, unusable evidence and references; required items otherwise.
  count: number;
  // The matrix group that holds these rows, so a link can open the subject already filtered.
  outcome: OutcomeGroupId | undefined;
  subjects: AttentionSubject[];
}

export interface BuildAttentionOptions {
  projection: Projection;
  subjects: SubjectGroup[];
  unusableComparisonIds: ReadonlySet<string>;
}

/**
 * What a reader should look at first, derived only from recorded data. Each item names the subjects it comes
 * from. A count the provider has no concept of is left out, never reported as zero.
 */
export function buildAttention({ projection, subjects, unusableComparisonIds }: BuildAttentionOptions): AttentionItem[] {
  const items: AttentionItem[] = [];
  const add = (kind: AttentionKind, outcome: OutcomeGroupId | undefined, countFor: (subject: SubjectGroup) => number): void => {
    const affected = subjects.filter((subject) => countFor(subject) > 0);
    const count = affected.reduce((sum, subject) => sum + countFor(subject), 0);
    if (count > 0) {
      items.push({ kind, count, outcome, subjects: affected.map(({ id, label, kind: subjectKind }) => ({ id, label, kind: subjectKind })) });
    }
  };

  add('failures', 'failed', (subject) => subject.comparisonCounts.failed);
  add('unusable-evidence', 'not-proven', (subject) => subject.comparisons.filter((comparison) => unusableComparisonIds.has(comparison.id)).length);
  add('needs-design', 'missing', (subject) => subject.summary.needsDesign ?? 0);
  add('not-enrolled', 'missing', (subject) => subject.summary.notEnrolled ?? 0);
  add('not-proven', 'not-proven', (subject) => subject.summary.unknown);
  add('unconfirmed-references', undefined, (subject) => subject.comparisons.filter((comparison) => isUnconfirmed(comparison.reference?.approval)).length);

  return items;
}

// An approval a person has not confirmed: recorded by an agent, or no longer bound to the current reference.
function isUnconfirmed(approval: { state: string; attestation?: string | undefined } | undefined): boolean {
  return approval !== undefined && (approval.attestation === 'agent' || approval.state === 'lapsed');
}

/** Subjects that most need a look first: failing, then unresolved, then by name. */
export function sortByAttention(subjects: SubjectGroup[]): SubjectGroup[] {
  const unresolved = (subject: SubjectGroup): number => subject.summary.required - subject.summary.proven - subject.summary.failing;
  return [...subjects].sort((a, b) => b.summary.failing - a.summary.failing || unresolved(b) - unresolved(a) || a.id.localeCompare(b.id));
}
