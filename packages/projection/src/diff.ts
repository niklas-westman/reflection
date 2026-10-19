import type { Comparison } from './comparison.js';
import { comparisonOutcome } from './comparison-outcome.js';
import type { Projection } from './projection.js';

export type ChangeKind = 'added' | 'updated' | 'removed' | 'unchanged';
export type ItemChangeKind = 'added' | 'removed' | 'reference-changed' | 'unchanged';

// The reference image of a required item as one release recorded it.
export interface ReferenceVersion {
  path: string;
  sha256: string;
}

export interface ItemChange {
  requirementId: string;
  label: string;
  change: ItemChangeKind;
  before?: ReferenceVersion;
  after?: ReferenceVersion;
}

export interface SubjectChange {
  id: string;
  kind: 'component' | 'page';
  change: ChangeKind;
  items: ItemChange[];
  counts: { added: number; removed: number; referenceChanged: number; unchanged: number };
}

export interface VerificationChanges {
  regressed: string[];
  fixed: string[];
  stillFailing: string[];
  newlyEnrolled: string[];
}

export interface ProjectionDiff {
  subjects: SubjectChange[];
  // Comparison ids for the first three; requirement ids for the last.
  verification: VerificationChanges;
  totals: {
    subjects: Record<ChangeKind, number>;
    items: { added: number; removed: number; referenceChanged: number };
  };
}

/**
 * What differs between two releases of the same project, from recorded data only.
 *
 * "Added", "removed" and "updated" describe the catalog of required items and their design references, and are
 * separate from verification outcomes. A reference counts as updated only when both releases recorded a hash for
 * it and the hashes differ (or one release had a reference and the other none). Without hashes nothing is claimed.
 */
export function diffProjections(previous: Projection, current: Projection): ProjectionDiff {
  const subjects = diffSubjects(previous, current);
  const totals = {
    subjects: { added: 0, updated: 0, removed: 0, unchanged: 0 } as Record<ChangeKind, number>,
    items: { added: 0, removed: 0, referenceChanged: 0 }
  };
  for (const subject of subjects) {
    totals.subjects[subject.change] += 1;
    totals.items.added += subject.counts.added;
    totals.items.removed += subject.counts.removed;
    totals.items.referenceChanged += subject.counts.referenceChanged;
  }
  return { subjects, verification: diffVerification(previous, current), totals };
}

type RequirementEntry = Projection['requirements'][number];

function diffSubjects(previous: Projection, current: Projection): SubjectChange[] {
  const previousReferences = referencesByRequirement(previous);
  const currentReferences = referencesByRequirement(current);
  const before = groupRequirements(previous.requirements);
  const after = groupRequirements(current.requirements);

  const keys = [...new Set([...after.keys(), ...before.keys()])].sort();
  return keys.map((key): SubjectChange => {
    const currentItems = after.get(key) ?? [];
    const previousItems = before.get(key) ?? [];
    const previousIds = new Set(previousItems.map((item) => item.id));
    const currentIds = new Set(currentItems.map((item) => item.id));

    const items: ItemChange[] = [
      ...currentItems.map((item): ItemChange => {
        if (!previousIds.has(item.id)) {
          return withReferences({ requirementId: item.id, label: item.label ?? item.id, change: 'added' }, undefined, currentReferences.get(item.id));
        }
        const was = previousReferences.get(item.id);
        const now = currentReferences.get(item.id);
        return withReferences({ requirementId: item.id, label: item.label ?? item.id, change: referenceChanged(was, now) ? 'reference-changed' : 'unchanged' }, was, now);
      }),
      ...previousItems.filter((item) => !currentIds.has(item.id)).map((item) => withReferences({ requirementId: item.id, label: item.label ?? item.id, change: 'removed' }, previousReferences.get(item.id), undefined))
    ];

    const counts = {
      added: items.filter((item) => item.change === 'added').length,
      removed: items.filter((item) => item.change === 'removed').length,
      referenceChanged: items.filter((item) => item.change === 'reference-changed').length,
      unchanged: items.filter((item) => item.change === 'unchanged').length
    };
    const [kind, id] = splitKey(key);
    const change: ChangeKind = previousItems.length === 0 ? 'added' : currentItems.length === 0 ? 'removed' : counts.added + counts.removed + counts.referenceChanged > 0 ? 'updated' : 'unchanged';
    return { id, kind, change, items, counts };
  });
}

function withReferences(item: ItemChange, before: ReferenceVersion | undefined, after: ReferenceVersion | undefined): ItemChange {
  return { ...item, ...(before ? { before } : {}), ...(after ? { after } : {}) };
}

function referenceChanged(was: ReferenceVersion | undefined, now: ReferenceVersion | undefined): boolean {
  if (was === undefined && now === undefined) return false;
  if (was === undefined || now === undefined) return true;
  return was.sha256 !== now.sha256;
}

// The reference of a requirement is the first one (by comparison id) that carries a hash. Implementations of the
// same item share their reference, so any of them says the same.
function referencesByRequirement(projection: Projection): Map<string, ReferenceVersion> {
  const references = new Map<string, ReferenceVersion>();
  const ordered = [...projection.comparisons].sort((a, b) => a.id.localeCompare(b.id));
  for (const comparison of ordered) {
    const version = referenceOf(comparison);
    if (version && comparison.requirementId && !references.has(comparison.requirementId)) {
      references.set(comparison.requirementId, version);
    }
  }
  return references;
}

function referenceOf(comparison: Comparison): ReferenceVersion | undefined {
  const reference = comparison.reference;
  const sha256 = reference?.baselineSha256 ?? reference?.artifact.sha256;
  return reference && sha256 ? { path: reference.artifact.path, sha256 } : undefined;
}

const keyOf = (requirement: RequirementEntry): string => `${requirement.subject.kind}\u0000${requirement.subject.id}`;

function groupRequirements(requirements: RequirementEntry[]): Map<string, RequirementEntry[]> {
  const groups = new Map<string, RequirementEntry[]>();
  for (const requirement of requirements) {
    groups.set(keyOf(requirement), [...(groups.get(keyOf(requirement)) ?? []), requirement]);
  }
  return groups;
}

function splitKey(key: string): ['component' | 'page', string] {
  const [kind, id] = key.split('\u0000');
  return [kind === 'component' ? 'component' : 'page', id ?? ''];
}

function diffVerification(previous: Projection, current: Projection): VerificationChanges {
  const was = new Map(previous.comparisons.map((comparison) => [comparison.id, comparisonOutcome(comparison)]));
  const regressed: string[] = [];
  const fixed: string[] = [];
  const stillFailing: string[] = [];
  for (const comparison of current.comparisons) {
    const before = was.get(comparison.id);
    const now = comparisonOutcome(comparison);
    if (before === 'passed' && now === 'failed') regressed.push(comparison.id);
    else if (before === 'failed' && now === 'passed') fixed.push(comparison.id);
    else if (before === 'failed' && now === 'failed') stillFailing.push(comparison.id);
  }

  const previousEnrolled = new Map(previous.requirements.map((requirement) => [requirement.id, requirement.enrolled]));
  const newlyEnrolled = current.requirements.filter((requirement) => requirement.enrolled && previousEnrolled.get(requirement.id) === false).map((requirement) => requirement.id);
  return { regressed: regressed.sort(), fixed: fixed.sort(), stillFailing: stillFailing.sort(), newlyEnrolled: newlyEnrolled.sort() };
}
