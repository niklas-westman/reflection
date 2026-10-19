import type { Run, SourceSnapshot, Validity } from 'reflection-projection';
import { describeRun, describeRuns, formatDate } from './format';

export interface FreshnessLine {
  label: string;
  value: string;
  // Shown in warning colour: the proof may no longer be about the current design or code.
  caution?: boolean;
}

export interface BuildFreshnessOptions {
  // The design data the proof read, each with its own date; never merged.
  snapshots: SourceSnapshot[];
  runs: Run[];
  builtAt: string;
  validity: Validity;
}

/**
 * "Is this proof still about the current design and code?" as three kinds of line, the same on every screen:
 * when the design was exported, when the run happened and how much older it is than the build, and what could
 * not be verified. The tool's own word about itself is kept, marked as not trusted.
 */
export function buildFreshness({ snapshots, runs, builtAt, validity }: BuildFreshnessOptions): FreshnessLine[] {
  const lines: FreshnessLine[] = snapshots.map((snapshot) => ({ label: 'Design', value: `${snapshot.label ?? snapshot.role}, captured ${formatDate(snapshot.capturedAt)}` }));
  if (runs.length === 1 && runs[0]) lines.push({ label: 'Run', value: describeRun(runs[0], builtAt) });
  else if (runs.length > 1) lines.push({ label: 'Runs', value: describeRuns(runs, builtAt) });
  lines.push(describeValidity(validity));
  const native = runs.length === 1 ? runs[0]?.nativeValidity : undefined;
  if (native) lines.push({ label: "Tool's own check", value: `${native} (not trusted)` });
  return lines;
}

function describeValidity(validity: Validity): FreshnessLine {
  switch (validity.state) {
    case 'offline':
      return { label: 'Not verified', value: 'Whether the design or code changed after the run: this bundle is offline' };
    case 'current':
      return { label: 'Verified', value: 'The design and code the run read are unchanged' };
    case 'stale':
      return { label: 'Changed since the run', value: validity.causes.map((cause) => `${cause.key} (${cause.change})`).join(', '), caution: true };
    case 'invalid':
      return { label: 'Unusable evidence', value: validity.reasons.join('; '), caution: true };
    case 'never-run':
      return { label: 'Not run', value: 'No run is recorded, so nothing was proven against this design', caution: true };
  }
}
