import { deriveReadiness, missingImplementations, type Comparison, type Projection, type ReferenceApproval, type Readiness, type Requirement, type Subject } from 'reflection-projection';
import { comparisonOutcome, type ComparisonOutcome } from './comparison-outcome';
import type { SubjectGroup } from './subject-model';

export type OutcomeGroupId = 'failed' | 'not-proven' | 'passed' | 'missing';

export const OUTCOME_GROUP_ORDER: readonly OutcomeGroupId[] = ['failed', 'not-proven', 'passed', 'missing'];

export interface MatrixColumn {
  id: string;
  label: string;
}

export interface MatrixCell {
  // Worst outcome among the comparisons in this cell; 'none' when nothing was compared here.
  outcome: ComparisonOutcome | 'none';
  comparisons: Comparison[];
  // The comparison to open and to show a thumbnail for: the first failed one, else the first.
  primary: Comparison | undefined;
  // Some evidence behind this cell could not be used, so its outcome is unknown.
  unusable: boolean;
}

export interface ReferenceSummary {
  availability: 'available' | 'missing' | 'unmapped' | 'unknown';
  source: string | undefined;
  approval: ReferenceApproval['state'] | undefined;
  attestation: ReferenceApproval['attestation'];
}

export interface MatrixRow {
  requirement: Requirement;
  label: string;
  dimensions: Record<string, string>;
  readiness: Readiness;
  group: OutcomeGroupId;
  // Why a row is not proven or missing, as a short category the group header can count.
  reason: string | undefined;
  // The provider's own longer explanation, shown on the row.
  detail: string | undefined;
  reference: ReferenceSummary;
  referenceIsCommon: boolean;
  cells: Map<string, MatrixCell>;
}

export interface MatrixGroup {
  id: OutcomeGroupId;
  rows: MatrixRow[];
  // For the missing group: how many rows per reason.
  reasons: Array<{ reason: string; count: number }>;
}

export interface Matrix {
  columns: MatrixColumn[];
  groups: MatrixGroup[];
  // The reference most rows share. Shown once in the column header so rows only say where they differ.
  commonReference: ReferenceSummary | undefined;
}

const NO_ADAPTER = '';

export interface BuildMatrixOptions {
  projection: Projection;
  subject: SubjectGroup;
  unusableComparisonIds: ReadonlySet<string>;
}

/** The table for one subject: one row per required item, grouped by outcome so failures are never buried. */
export function buildMatrix({ projection, subject, unusableComparisonIds }: BuildMatrixOptions): Matrix {
  const concepts = projection.provider.readinessConcepts;
  const columns = buildColumns(subject.comparisons, subject.requirements);
  const snapshotLabels = new Map(projection.snapshots.map((snapshot) => [snapshot.id, snapshot.label ?? snapshot.version ?? snapshot.role]));
  const byRequirement = new Map<string, Comparison[]>();
  for (const comparison of subject.comparisons) {
    if (comparison.requirementId) {
      byRequirement.set(comparison.requirementId, [...(byRequirement.get(comparison.requirementId) ?? []), comparison]);
    }
  }

  const rows = subject.requirements.map((requirement): MatrixRow => {
    const comparisons = byRequirement.get(requirement.id) ?? [];
    const readiness = deriveReadiness(requirement, comparisons, concepts);
    const group = groupOf(readiness);
    return {
      requirement,
      label: requirement.label ?? requirement.id,
      dimensions: dimensionsOf(requirement.subject),
      readiness,
      group,
      reason: reasonFor(readiness, comparisons, requirement, unusableComparisonIds),
      detail: detailFor(readiness, requirement, comparisons),
      reference: summarizeReference(requirement, comparisons, snapshotLabels),
      referenceIsCommon: false,
      cells: buildCells(columns, comparisons, unusableComparisonIds)
    };
  });

  const groups = OUTCOME_GROUP_ORDER.map((id): MatrixGroup => {
    const groupRows = rows.filter((row) => row.group === id);
    return { id, rows: groupRows, reasons: id === 'missing' ? countReasons(groupRows) : [] };
  });
  const commonReference = findCommonReference(rows);
  for (const row of rows) {
    row.referenceIsCommon = commonReference !== undefined && referenceKey(row.reference) === referenceKey(commonReference);
  }
  return { columns, groups, commonReference };
}

const COMMON_SHARE = 0.6;

// A reference is "common" when at least two available rows share it and they are most of the available rows.
function findCommonReference(rows: MatrixRow[]): ReferenceSummary | undefined {
  const available = rows.filter((row) => row.reference.availability === 'available');
  const counts = new Map<string, { reference: ReferenceSummary; count: number }>();
  for (const row of available) {
    const key = referenceKey(row.reference);
    counts.set(key, { reference: row.reference, count: (counts.get(key)?.count ?? 0) + 1 });
  }
  const [top] = [...counts.values()].sort((a, b) => b.count - a.count);
  return top && top.count >= 2 && top.count / available.length >= COMMON_SHARE ? top.reference : undefined;
}

export function referenceKey(reference: ReferenceSummary): string {
  return [reference.availability, reference.source ?? '', reference.approval ?? '', reference.attestation ?? ''].join('|');
}

// One column per implementation: those with a comparison, and those a requirement names as required even if
// nothing was ever compared in them, so a missing implementation is visible as an empty column, not as no column.
function buildColumns(comparisons: Comparison[], requirements: Requirement[]): MatrixColumn[] {
  const required = requirements.flatMap((requirement) => requirement.requiredImplementations ?? []);
  const adapters = [...new Set([...comparisons.map((comparison) => comparison.subject.adapter ?? NO_ADAPTER), ...required])].sort();
  if (adapters.length === 0) {
    return [{ id: NO_ADAPTER, label: 'Result' }];
  }
  return adapters.map((adapter) => ({ id: adapter, label: adapter === NO_ADAPTER ? 'Result' : adapter }));
}

function buildCells(columns: MatrixColumn[], comparisons: Comparison[], unusable: ReadonlySet<string>): Map<string, MatrixCell> {
  return new Map(
    columns.map((column) => {
      const here = comparisons.filter((comparison) => (comparison.subject.adapter ?? NO_ADAPTER) === column.id);
      const outcomes = here.map(comparisonOutcome);
      const outcome: MatrixCell['outcome'] = outcomes.includes('failed') ? 'failed' : outcomes.includes('not-run') ? 'not-run' : outcomes.length > 0 ? 'passed' : 'none';
      const primary = here.find((comparison) => comparisonOutcome(comparison) === 'failed') ?? here[0];
      return [column.id, { outcome, comparisons: here, primary, unusable: here.some((comparison) => unusable.has(comparison.id)) }];
    })
  );
}

function groupOf(readiness: Readiness): OutcomeGroupId {
  if (readiness === 'failing') return 'failed';
  if (readiness === 'proven') return 'passed';
  if (readiness === 'needs-design' || readiness === 'not-enrolled') return 'missing';
  return 'not-proven';
}

function reasonFor(readiness: Readiness, comparisons: Comparison[], requirement: Requirement, unusable: ReadonlySet<string>): string | undefined {
  if (readiness === 'needs-design') return 'No design selected';
  if (readiness === 'not-enrolled') return 'Not enrolled';
  if (readiness !== 'unknown') return undefined;
  if (comparisons.some((comparison) => unusable.has(comparison.id))) return 'Evidence file unusable';
  if (missingImplementations(requirement, comparisons).length > 0) return 'Not compared in every required implementation';
  if (comparisons.length === 0) return requirement.enrolled ? 'No comparison recorded' : 'Not covered';
  return 'Not every required proof ran';
}

function detailFor(readiness: Readiness, requirement: Requirement, comparisons: Comparison[]): string | undefined {
  if (readiness === 'needs-design' || readiness === 'not-enrolled') return requirement.design?.reason;
  const missing = readiness === 'unknown' ? missingImplementations(requirement, comparisons) : [];
  return missing.length > 0 ? `Required implementations not compared: ${missing.join(', ')}` : undefined;
}

export function countReasons(rows: MatrixRow[]): Array<{ reason: string; count: number }> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const reason = row.reason ?? 'Missing';
    counts.set(reason, (counts.get(reason) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([reason, count]) => ({ reason, count }));
}

// Availability and source of the reference. It is never given a pass or fail: a reference is not a proof.
function summarizeReference(requirement: Requirement, comparisons: Comparison[], snapshotLabels: Map<string, string>): ReferenceSummary {
  const withReference = comparisons.find((comparison) => comparison.reference);
  const availability = requirement.design?.availability ?? (withReference ? 'available' : 'unknown');
  const snapshotId = withReference?.snapshotId ?? requirement.design?.snapshotId;
  return {
    availability,
    source: withReference?.reference?.origin ?? (snapshotId ? snapshotLabels.get(snapshotId) : undefined),
    approval: withReference?.reference?.approval.state,
    attestation: withReference?.reference?.approval.attestation
  };
}

/** The common dimensions plus whatever the provider added, without the adapter (which is a column). */
export function dimensionsOf(subject: Subject): Record<string, string> {
  const dimensions: Record<string, string> = {};
  for (const key of ['variant', 'mode', 'state', 'viewport'] as const) {
    const value = subject[key];
    if (value) {
      dimensions[key] = value;
    }
  }
  return { ...dimensions, ...subject.dimensions };
}
