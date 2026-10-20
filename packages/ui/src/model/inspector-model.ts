import { missingImplementations, type Artifact, type Comparison, type Projection, type ProofLayer, type StandingDeviation, type Validity } from 'reflection-projection';
import { comparisonOutcome, type ComparisonOutcome } from './comparison-outcome';
import { formatDate } from './format';
import { buildFreshness, type FreshnessLine } from './freshness';
import { rowMatches, type MatrixFilters } from './filters';
import type { Matrix, MatrixRow } from './matrix-model';

export interface MeasurementSample {
  part: string;
  property: string;
  expected: string;
  actual: string;
  delta: string | undefined;
  tolerance: string | undefined;
  passed: boolean;
}

export interface Fact {
  label: string;
  value: string;
  // Hashes and ids read better in a fixed-width face.
  mono?: boolean;
}

export interface SequenceInfo {
  ids: string[];
  index: number;
  previous: string | undefined;
  next: string | undefined;
  // False when the current comparison is outside the filtered list, so the whole subject is walked instead.
  filtered: boolean;
}

export interface Sibling {
  id: string;
  label: string;
  outcome: ComparisonOutcome;
}

export interface DiffSummary {
  // The tool's id for the metric, always shown so it can be looked up.
  metric: string;
  // What it is called and its value with its unit, for example "Match" and "99.75 %"; the id and the bare value without a label.
  label: string;
  valueText: string;
  // "Passes at 95 % or more" when the provider gave the passing line and direction; "Higher is better" with a direction only.
  meaning: string | undefined;
  value: number;
  ratio: number | undefined;
  threshold: Array<{ name: string; value: number }>;
}

export interface InspectorModel {
  comparison: Comparison;
  row: MatrixRow | undefined;
  label: string;
  implementation: string | undefined;
  outcome: ComparisonOutcome;
  unusable: boolean;
  // The deviation the owner accepted for this comparison: who, when, the words, and whether it still holds.
  deviation: { holds: boolean; standing: string; facts: Fact[] } | undefined;
  // Set when the comparison read a superseded design source: what it read, what replaced it, and what it recorded.
  superseded: { source: string; replacedBy: string; recordedOutcome: ComparisonOutcome } | undefined;
  referenceArtifact: Artifact | undefined;
  actualArtifact: Artifact | undefined;
  diffArtifact: Artifact | undefined;
  referenceApproval: { state: string; attestation: string | undefined } | undefined;
  // Who approved the reference, who wrote it down, when, and what it was bound to; all as recorded.
  approvalFacts: Fact[];
  // A reference nobody confirmed is a trust fact shown in warning colour.
  caution: string | undefined;
  verdict: string;
  // The producing tool's own word, shown as "native" and never counted.
  nativeOutcome: string | undefined;
  measurements: { total: number; passedCount: number; failing: MeasurementSample[]; passing: MeasurementSample[]; sentence: string | undefined } | undefined;
  diffSummary: DiffSummary | undefined;
  facts: Fact[];
  // Whether this comparison's proof is still about the current design and code; the same lines as on the overview.
  freshness: FreshnessLine[];
  provenance: Fact[];
  gaps: string[];
  limitations: string[];
  siblings: Sibling[];
  // False when no comparison in the bundle records measurements: the provider measures pixels only.
  bundleRecordsMeasurements: boolean;
  // False when nothing in the bundle is split by implementation, so "no other implementation" says nothing.
  implementationsRecorded: boolean;
  sequence: SequenceInfo;
}

export interface BuildInspectorOptions {
  projection: Projection;
  matrix: Matrix;
  // The filters of the page the reader came from; previous and next walk what that page was showing.
  filters: MatrixFilters;
  comparisonId: string;
  unusableComparisonIds: ReadonlySet<string>;
  bundleHash: string;
  builtAt: string;
  validity: Validity;
  supersededComparisonIds?: ReadonlySet<string>;
  // Comparisons as the provider recorded them, before an unusable file or a superseded source set their proof aside.
  recordedComparisons?: ReadonlyMap<string, Comparison>;
  deviations?: ReadonlyMap<string, StandingDeviation>;
}

/** Everything the inspector shows, derived from one recorded comparison. Pure; nothing here is invented. */
export function buildInspectorModel(options: BuildInspectorOptions): InspectorModel | undefined {
  const { projection, matrix, comparisonId, unusableComparisonIds } = options;
  const comparison = projection.comparisons.find((entry) => entry.id === comparisonId);
  if (!comparison) {
    return undefined;
  }

  const rows = matrix.groups.flatMap((group) => group.rows);
  const row = rows.find((entry) => entry.requirement.id === comparison.requirementId);
  const unusable = unusableComparisonIds.has(comparison.id);
  const superseded = options.supersededComparisonIds?.has(comparison.id) ? describeSuperseded(comparison, projection, options.recordedComparisons?.get(comparison.id) ?? comparison) : undefined;
  const implementation = comparison.subject.adapter;
  const approval = comparison.reference?.approval;
  const measurements = comparison.measurements;

  const failing = (measurements?.samples ?? []).filter((sample) => !sample.passed).map(toSample);
  const bundleRecordsMeasurements = projection.comparisons.some((entry) => entry.measurements !== undefined);
  return {
    comparison,
    row,
    label: [row?.label ?? comparison.id, implementation].filter(Boolean).join(' · '),
    implementation,
    outcome: comparisonOutcome(comparison),
    unusable,
    superseded,
    deviation: describeDeviation(options.deviations?.get(comparison.id)),
    referenceArtifact: comparison.reference?.artifact,
    actualArtifact: comparison.actual,
    diffArtifact: comparison.diff?.artifact,
    referenceApproval: approval ? { state: approval.state, attestation: approval.attestation } : undefined,
    approvalFacts: buildApprovalFacts(comparison, projection),
    caution: approvalCaution(approval),
    verdict: [comparison.verdict.status, comparison.verdict.severity, comparison.verdict.failureClass].filter(Boolean).join(' / '),
    nativeOutcome: comparison.nativeOutcome,
    measurements: measurements
      ? {
          total: measurements.total,
          passedCount: measurements.passed,
          failing,
          passing: measurements.samples.filter((sample) => sample.passed).map(toSample),
          sentence: failing[0] ? describeSample(failing[0]) : undefined
        }
      : undefined,
    diffSummary: comparison.diff ? summarizeDiff(comparison.diff) : undefined,
    facts: buildFacts(comparison),
    freshness: buildFreshness({
      snapshots: projection.snapshots.filter((snapshot) => snapshot.id === comparison.snapshotId),
      runs: projection.runs.filter((run) => run.id === comparison.runId),
      builtAt: options.builtAt,
      validity: options.validity
    }),
    provenance: buildProvenance(comparison, projection, options.bundleHash),
    gaps: superseded ? [`It proved ${superseded.source}, which was superseded by ${superseded.replacedBy}. Its result is not counted until it runs against the current source.`] : buildGaps(comparison, row, unusable, bundleRecordsMeasurements),
    bundleRecordsMeasurements,
    limitations: comparison.limitations ?? [],
    siblings: siblingsOf(comparison, projection),
    implementationsRecorded: projection.comparisons.some((entry) => entry.subject.adapter !== undefined) || projection.requirements.some((entry) => (entry.requiredImplementations ?? []).length > 0),
    sequence: buildSequence(options, rows)
  };
}

function summarizeDiff(diff: NonNullable<Comparison['diff']>): DiffSummary {
  const { metric } = diff;
  const withUnit = (value: number): string => (metric.unit ? `${value} ${metric.unit}` : String(value));
  return {
    metric: metric.name,
    label: metric.label ?? metric.name,
    valueText: withUnit(metric.value),
    meaning: describeMetricMeaning(metric.direction, metric.passAt === undefined ? undefined : withUnit(metric.passAt)),
    value: metric.value,
    ratio: metric.ratio,
    threshold: Object.entries(diff.threshold ?? {}).map(([name, value]) => ({ name, value }))
  };
}

function describeMetricMeaning(direction: 'higher-is-better' | 'lower-is-better' | undefined, passAt: string | undefined): string | undefined {
  if (!direction) return undefined;
  if (passAt === undefined) return direction === 'higher-is-better' ? 'Higher is better' : 'Lower is better';
  return `Passes at ${passAt} or ${direction === 'higher-is-better' ? 'more' : 'less'}`;
}

function describeDeviation(deviation: StandingDeviation | undefined): InspectorModel['deviation'] {
  if (!deviation) return undefined;
  const { decision, standing } = deviation;
  const facts: Fact[] = [{ label: 'Accepted by', value: decision.by }];
  if (decision.recordedBy) facts.push({ label: 'Written down by', value: decision.recordedBy });
  facts.push({ label: 'Accepted on', value: formatDate(decision.at) });
  if (decision.comment ?? decision.message) facts.push({ label: 'Words', value: decision.comment ?? decision.message ?? '' });
  if (deviation.comparisonIds.length > 1) facts.push({ label: 'Covers', value: `${deviation.comparisonIds.length} comparisons` });
  const text =
    standing.state === 'holds'
      ? 'Still holds: nothing it was bound to changed.'
      : standing.state === 'carried-forward'
        ? `Carried forward from build ${standing.from}: nothing it was bound to changed.`
        : standing.state === 'lapsed'
          ? `No longer holds: ${standing.causes.map((cause) => `${cause.kind} of ${cause.id} ${cause.change}`).join('; ')}.`
          : 'Withdrawn.';
  return { holds: standing.state === 'holds' || standing.state === 'carried-forward', standing: text, facts };
}

function describeSuperseded(comparison: Comparison, projection: Projection, recorded: Comparison): NonNullable<InspectorModel['superseded']> {
  const snapshotName = (id: string | undefined): string => {
    const snapshot = projection.snapshots.find((entry) => entry.id === id);
    return snapshot ? `${snapshot.label ?? snapshot.role}, captured ${formatDate(snapshot.capturedAt)}` : 'an unknown design source';
  };
  const read = projection.snapshots.find((entry) => entry.id === comparison.snapshotId);
  return { source: snapshotName(read?.id), replacedBy: snapshotName(read?.supersededBy), recordedOutcome: comparisonOutcome(recorded) };
}

function toSample(sample: { part: string; property: string; expected: string; actual: string; delta?: string | undefined; tolerance?: string | undefined; passed: boolean }): MeasurementSample {
  return { part: sample.part, property: sample.property, expected: sample.expected, actual: sample.actual, delta: sample.delta, tolerance: sample.tolerance, passed: sample.passed };
}

/** One plain sentence for a failing measurement, from the recorded values only. */
export function describeSample(sample: MeasurementSample): string {
  return `${sample.part} ${sample.property}: the design says ${sample.expected}, the implementation has ${sample.actual}${sample.delta ? ` (${sample.delta})` : ''}.`;
}

function approvalCaution(approval: { state: string; attestation?: string | undefined } | undefined): string | undefined {
  if (approval?.state === 'lapsed') return 'The approval of this reference no longer matches the current reference.';
  if (approval?.state === 'holds' && approval.attestation === 'agent') return 'The reference approval was recorded by an agent. A person has not confirmed it, and a passing comparison does not grant that approval.';
  return undefined;
}

const ATTESTATION_TEXT: Record<string, string> = {
  human: 'Approved and recorded by a person',
  delegated: 'Approved by a person, written down by an agent',
  agent: "Recorded by an agent, no person's words"
};

/** The reference approval as recorded: who, through whom, when, and whether it is bound to the design source it names. */
function buildApprovalFacts(comparison: Comparison, projection: Projection): Fact[] {
  const approval = comparison.reference?.approval;
  if (!approval || approval.state === 'none') return [];
  const facts: Fact[] = [];
  if (approval.state === 'lapsed') facts.push({ label: 'Approval', value: 'No longer matches the current reference' });
  if (approval.attestation) facts.push({ label: approval.state === 'lapsed' ? 'It was' : 'Approval', value: ATTESTATION_TEXT[approval.attestation] ?? approval.attestation });
  if (approval.by) facts.push({ label: 'Approved by', value: approval.by });
  if (approval.recordedBy) facts.push({ label: 'Recorded by', value: approval.recordedBy });
  if (approval.at) facts.push({ label: 'Approved on', value: formatDate(approval.at) });
  if (approval.boundTo) {
    const snapshot = projection.snapshots.find((entry) => entry.id === comparison.snapshotId);
    facts.push({ label: 'Bound to', value: approval.boundTo, mono: true });
    if (snapshot?.sha256) facts.push({ label: 'Design source', value: snapshot.sha256 === approval.boundTo ? 'Same content as the design source this comparison read' : 'Differs from the design source this comparison read' });
  }
  for (const cause of approval.causes ?? []) facts.push({ label: 'Changed since', value: cause });
  if (approval.note) facts.push({ label: 'Note', value: approval.note });
  return facts;
}

function buildFacts(comparison: Comparison): Fact[] {
  const { subject } = comparison;
  const facts: Fact[] = [];
  if (subject.viewport) facts.push({ label: 'Viewport', value: subject.viewport });
  if (subject.state) facts.push({ label: 'State', value: subject.state });
  if (subject.mode) facts.push({ label: 'Mode', value: subject.mode });
  return facts;
}

function buildProvenance(comparison: Comparison, projection: Projection, bundleHash: string): Fact[] {
  const run = projection.runs.find((entry) => entry.id === comparison.runId);
  const snapshot = projection.snapshots.find((entry) => entry.id === comparison.snapshotId);
  const facts: Fact[] = [];
  if (run) {
    facts.push({ label: 'Run', value: run.id, mono: true });
    for (const [key, value] of Object.entries(run.runner ?? {})) {
      if (typeof value === 'string' || typeof value === 'number') facts.push({ label: key, value: String(value) });
    }
  }
  if (snapshot) {
    facts.push({ label: 'Design source', value: `${snapshot.label ?? snapshot.role}, captured ${formatDate(snapshot.capturedAt)}` });
    if (snapshot.fileKey) facts.push({ label: 'Source file', value: snapshot.fileKey, mono: true });
  }
  const hashes: Array<[string, string | undefined]> = [
    ['Reference file', comparison.reference?.artifact.sha256],
    ['Approved baseline', comparison.reference?.baselineSha256],
    ['Actual file', comparison.actual?.sha256],
    ['Diff file', comparison.diff?.artifact?.sha256],
    ['Capture policy', comparison.capturePolicyHash]
  ];
  for (const [label, value] of hashes) {
    if (value) facts.push({ label, value, mono: true });
  }
  if (comparison.sourceNodeIds && comparison.sourceNodeIds.length > 0) {
    facts.push({ label: 'Design source nodes', value: comparison.sourceNodeIds.join(', '), mono: true });
  }
  facts.push({ label: 'Bundle', value: bundleHash, mono: true });
  return facts;
}

const LAYER_TEXT: Record<string, string> = { 'not-run': 'did not run', unsupported: 'is unsupported', absent: 'was not recorded' };

/** What this comparison did not prove, so a reader never mistakes a pass on one layer for all of them. */
function buildGaps(comparison: Comparison, row: MatrixRow | undefined, unusable: boolean, bundleRecordsMeasurements: boolean): string[] {
  const gaps: string[] = [];
  if (unusable) gaps.push('A file behind this comparison is unusable, so its result is unknown.');
  for (const layer of (row?.requirement.requiredProofs ?? []) as ProofLayer[]) {
    const outcome = comparison.proof[layer] ?? 'absent';
    if (outcome !== 'passed' && outcome !== 'failed') {
      gaps.push(`The ${layer} proof ${LAYER_TEXT[outcome] ?? outcome}.`);
    }
  }
  if (!comparison.reference) gaps.push('No reference image was recorded.');
  if (!comparison.actual) gaps.push('No implementation image was recorded.');
  if (!comparison.diff) gaps.push('No difference image or pixel metric was recorded.');
  // Only a gap when this provider records measurements elsewhere; a pixel-only provider never had them.
  if (!comparison.measurements && bundleRecordsMeasurements) gaps.push('Detailed measurements were not recorded.');
  if (approvalCaution(comparison.reference?.approval)) gaps.push('The reference approval is not confirmed by a person.');
  const requiredMissing = row ? missingImplementations(row.requirement, [...row.cells.values()].flatMap((cell) => cell.comparisons)) : [];
  if (requiredMissing.length > 0) gaps.push(`A required implementation was not compared, so the item is not proven: ${requiredMissing.join(', ')}.`);
  const notCompared = [...(row?.cells.entries() ?? [])].filter(([id, cell]) => cell.outcome === 'none' && !requiredMissing.includes(id)).map(([id]) => (id === '' ? 'Result' : id));
  if (notCompared.length > 0) gaps.push(`This item was not compared in: ${notCompared.join(', ')}.`);
  return gaps;
}

function siblingsOf(comparison: Comparison, projection: Projection): Sibling[] {
  return projection.comparisons
    .filter((entry) => entry.requirementId !== undefined && entry.requirementId === comparison.requirementId && entry.id !== comparison.id)
    .map((entry) => ({ id: entry.id, label: entry.subject.adapter ?? entry.id, outcome: comparisonOutcome(entry) }));
}

/** The comparisons of the subject in the order its matrix shows them, so previous and next follow the page it came from. */
function buildSequence(options: BuildInspectorOptions, rows: MatrixRow[]): SequenceInfo {
  // A page filtered to failures is for walking failures, so only the failed comparisons of those items are visited.
  const failuresOnly = options.filters.outcomes.length > 0 && options.filters.outcomes.every((outcome) => outcome === 'failed');
  const orderOf = (list: MatrixRow[], onlyFailed = false): string[] =>
    list.flatMap((row) => [...row.cells.values()].flatMap((cell) => cell.comparisons.filter((comparison) => !onlyFailed || comparisonOutcome(comparison) === 'failed').map((comparison) => comparison.id)));
  const all = orderOf(rows);
  const filteredIds = orderOf(rows.filter((row) => rowMatches(row, options.filters)), failuresOnly);
  const filtered = filteredIds.includes(options.comparisonId);
  const ids = filtered ? filteredIds : all;
  const index = ids.indexOf(options.comparisonId);
  return { ids, index, previous: index > 0 ? ids[index - 1] : undefined, next: index >= 0 && index < ids.length - 1 ? ids[index + 1] : undefined, filtered };
}
