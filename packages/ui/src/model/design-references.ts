import type { Projection, SourceSnapshot } from 'reflection-projection';

export interface SnapshotUse {
  snapshot: SourceSnapshot;
  // This release lists the snapshot among the ones it used.
  usedByRelease: boolean;
  comparisons: number;
  subjects: number;
}

export interface ApprovalCounts {
  byPerson: number;
  // A person's approval given in conversation and written down by an agent.
  byPersonThroughAgent: number;
  byAgent: number;
  lapsed: number;
  none: number;
  // Comparisons with no reference at all.
  noReference: number;
}

// One delegated approval record as the provider wrote it, with how many comparisons it covers.
export interface DelegatedNote {
  by: string | undefined;
  recordedBy: string | undefined;
  at: string | undefined;
  note: string;
  comparisons: number;
}

export interface DesignReferences {
  snapshots: SnapshotUse[];
  approvals: ApprovalCounts;
  delegatedNotes: DelegatedNote[];
}

/**
 * The design sources a release rests on, each with its own date, and how many comparisons read it. Dates are
 * never merged: several snapshots can be recorded and a proof is based on the one it actually read.
 */
export function summarizeDesignReferences(projection: Projection): DesignReferences {
  const snapshots = projection.snapshots.map((snapshot): SnapshotUse => {
    const reading = projection.comparisons.filter((comparison) => comparison.snapshotId === snapshot.id);
    return {
      snapshot,
      usedByRelease: projection.release?.snapshotIds.includes(snapshot.id) ?? false,
      comparisons: reading.length,
      subjects: new Set(reading.map((comparison) => `${comparison.subject.kind}/${comparison.subject.id}`)).size
    };
  });

  const approvals: ApprovalCounts = { byPerson: 0, byPersonThroughAgent: 0, byAgent: 0, lapsed: 0, none: 0, noReference: 0 };
  for (const comparison of projection.comparisons) {
    const approval = comparison.reference?.approval;
    if (!approval) approvals.noReference += 1;
    else if (approval.state === 'lapsed') approvals.lapsed += 1;
    else if (approval.state === 'none') approvals.none += 1;
    else if (approval.attestation === 'agent') approvals.byAgent += 1;
    else if (approval.attestation === 'delegated') approvals.byPersonThroughAgent += 1;
    else approvals.byPerson += 1;
  }
  return { snapshots, approvals, delegatedNotes: collectDelegatedNotes(projection) };
}

/** Delegated approvals that hold, one entry per distinct record, oldest first, so a person can re-read what was written for them. */
function collectDelegatedNotes(projection: Projection): DelegatedNote[] {
  const notes = new Map<string, DelegatedNote>();
  for (const comparison of projection.comparisons) {
    const approval = comparison.reference?.approval;
    if (approval?.state !== 'holds' || approval.attestation !== 'delegated') continue;
    const key = JSON.stringify([approval.by, approval.recordedBy, approval.at, approval.note]);
    const existing = notes.get(key);
    if (existing) existing.comparisons += 1;
    else notes.set(key, { by: approval.by, recordedBy: approval.recordedBy, at: approval.at, note: approval.note ?? '', comparisons: 1 });
  }
  return [...notes.values()].sort((a, b) => (a.at ?? '').localeCompare(b.at ?? '') || a.note.localeCompare(b.note));
}
