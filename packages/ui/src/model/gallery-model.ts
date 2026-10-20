import { missingImplementations, type Comparison, type Projection, type ProofLayer, type ProofOutcome } from 'reflection-projection';
import { comparisonOutcome, type ComparisonOutcome } from './comparison-outcome';
import { formatDate } from './format';
import type { Matrix, MatrixColumn, MatrixRow, ReferenceSummary } from './matrix-model';

export interface DimensionChoice {
  name: string;
  values: string[];
}

/** Every required item of the subject, the ones that most need attention first (the matrix's own group order). */
export function orderedRows(matrix: Matrix): MatrixRow[] {
  return matrix.groups.flatMap((group) => group.rows);
}

/** The dimensions a reader can choose between: only those with more than one value. */
export function dimensionChoices(rows: MatrixRow[]): DimensionChoice[] {
  const values = new Map<string, Set<string>>();
  for (const row of rows) {
    for (const [name, value] of Object.entries(row.dimensions)) {
      values.set(name, (values.get(name) ?? new Set()).add(value));
    }
  }
  return [...values.entries()]
    .filter(([, set]) => set.size > 1)
    .map(([name, set]) => ({ name, values: [...set].sort() }));
}

/**
 * The item to show for a set of wanted dimension values. Not every combination exists, so a change to one
 * dimension keeps that value and as many of the others as an existing item allows. There is always a real item.
 */
export function pickRow(rows: MatrixRow[], wanted: Record<string, string>, pinned?: string): MatrixRow | undefined {
  const candidates = pinned !== undefined && rows.some((row) => row.dimensions[pinned] === wanted[pinned]) ? rows.filter((row) => row.dimensions[pinned] === wanted[pinned]) : rows;
  const overlap = (row: MatrixRow): number => Object.entries(wanted).filter(([name, value]) => row.dimensions[name] === value).length;
  return candidates.reduce<MatrixRow | undefined>((best, row) => (best === undefined || overlap(row) > overlap(best) ? row : best), undefined);
}

/** The item a URL asks for, else the one that most needs attention. */
export function currentRow(rows: MatrixRow[], itemId: string | undefined): MatrixRow | undefined {
  return rows.find((row) => row.requirement.id === itemId) ?? rows[0];
}

/** The implementations to show: those named, in the matrix's order, else all. Unknown names are ignored. */
export function selectedColumns(columns: MatrixColumn[], wanted: string[] | undefined): MatrixColumn[] {
  const chosen = wanted === undefined ? columns : columns.filter((column) => wanted.includes(column.id));
  return chosen.length > 0 ? chosen : columns;
}

export interface ReferenceCard {
  availability: ReferenceSummary['availability'];
  approval: ReferenceSummary['approval'];
  attestation: ReferenceSummary['attestation'];
  source: string | undefined;
  capturedAt: string | undefined;
  artifactPath: string | undefined;
}

export interface AdapterCard {
  column: MatrixColumn;
  comparison: Comparison | undefined;
  outcome: ComparisonOutcome | 'none';
  unusable: boolean;
  superseded: boolean;
  artifactPath: string | undefined;
  // The requirement names this implementation as one that must pass.
  required: boolean;
}

export interface LayerRow {
  column: MatrixColumn;
  layers: Array<{ layer: ProofLayer; outcome: ProofOutcome | 'absent' }>;
}

export interface ItemFacts {
  viewports: string[];
  // Recorded by the comparison, never adjustable: a viewer cannot re-judge a pass.
  threshold: Array<{ name: string; value: number }>;
  runFinishedAt: string | undefined;
  referenceCapturedAt: string | undefined;
  comparisonsExecuted: number;
  comparisonsPassed: number;
}

export interface ItemDetail {
  row: MatrixRow;
  // Required implementations with no comparison for this item: these keep it from being proven.
  requiredNotCompared: string[];
  // Other implementations of this subject with no comparison for this item. They are not part of the status.
  otherNotCompared: string[];
  reference: ReferenceCard;
  adapters: AdapterCard[];
  layerRows: LayerRow[];
  facts: ItemFacts;
}

export interface ItemDetailOptions {
  row: MatrixRow;
  projection: Projection;
  columns: MatrixColumn[];
  unusableComparisonIds: ReadonlySet<string>;
}

/** Everything the gallery shows for one required item: its reference, one card per chosen implementation, and the facts. */
export function buildItemDetail({ row, projection, columns, unusableComparisonIds }: ItemDetailOptions): ItemDetail {
  const all = [...row.cells.values()].flatMap((cell) => cell.comparisons);
  const withReference = all.find((comparison) => comparison.reference);
  const snapshot = projection.snapshots.find((entry) => entry.id === (withReference?.snapshotId ?? row.requirement.design?.snapshotId));
  const runs = projection.runs.filter((run) => all.some((comparison) => comparison.runId === run.id));
  const latestRun = runs.map((run) => run.finishedAt).sort().at(-1);

  const adapters = columns.map((column): AdapterCard => {
    const cell = row.cells.get(column.id);
    const comparison = cell?.primary;
    return { column, comparison, outcome: cell?.outcome ?? 'none', unusable: cell?.unusable ?? false, superseded: cell?.superseded ?? false, artifactPath: comparison?.actual?.path, required: (row.requirement.requiredImplementations ?? []).includes(column.id) };
  });

  const outcomes = all.map(comparisonOutcome);
  const thresholdSource = all.find((comparison) => comparison.diff?.threshold);
  return {
    row,
    requiredNotCompared: missingImplementations(row.requirement, all),
    otherNotCompared: [...row.cells.entries()].filter(([id, cell]) => cell.outcome === 'none' && !(row.requirement.requiredImplementations ?? []).includes(id)).map(([id]) => allColumnLabel(id)),
    reference: {
      availability: row.reference.availability,
      approval: row.reference.approval,
      attestation: row.reference.attestation,
      source: row.reference.source,
      capturedAt: withReference?.reference?.baselineCreatedAt ?? snapshot?.capturedAt,
      artifactPath: withReference?.reference?.artifact.path
    },
    adapters,
    layerRows: adapters.map((card) => ({
      column: card.column,
      layers: row.requirement.requiredProofs.map((layer) => ({ layer, outcome: card.comparison?.proof[layer] ?? 'absent' }))
    })),
    facts: {
      viewports: [...new Set(all.flatMap((comparison) => (comparison.subject.viewport ? [comparison.subject.viewport] : [])))],
      threshold: Object.entries(thresholdSource?.diff?.threshold ?? {}).map(([name, value]) => ({ name, value })),
      runFinishedAt: latestRun,
      referenceCapturedAt: withReference?.reference?.baselineCreatedAt,
      comparisonsExecuted: outcomes.filter((outcome) => outcome !== 'not-run').length,
      comparisonsPassed: outcomes.filter((outcome) => outcome === 'passed').length
    }
  };
}

function allColumnLabel(id: string): string {
  return id === '' ? 'Result' : id;
}

export function describeDate(iso: string | undefined): string {
  return iso ? formatDate(iso) : 'Not recorded';
}

/** The selection rule for a page's recorded checks: failures and unproven items first, at least three cards, at most six. */
export const PAGE_CHECKS_MIN = 3;
export const PAGE_CHECKS_MAX = 6;

export function pageChecks(rows: MatrixRow[]): { shown: MatrixRow[]; total: number } {
  // A check is something recorded, so an item with no comparison at all has nothing to show here.
  const withEvidence = rows.filter((row) => [...row.cells.values()].some((cell) => cell.primary !== undefined));
  const needsLook = withEvidence.filter((row) => row.group === 'failed' || row.group === 'not-proven');
  const count = Math.min(Math.max(PAGE_CHECKS_MIN, needsLook.length), PAGE_CHECKS_MAX);
  // The matrix already orders failed, not proven, passed.
  return { shown: withEvidence.slice(0, count), total: rows.length };
}
