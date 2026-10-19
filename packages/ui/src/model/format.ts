// Fixed month names: the platform's own short names differ between versions ("Sep" and "Sept"), and the same
// bundle must read the same everywhere.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

/** A calendar date in UTC, such as "14 Oct 2026". */
export function formatDate(iso: string): string {
  const date = new Date(iso);
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()] ?? ''} ${date.getUTCFullYear()}`;
}

export function joinDimensions(dimensions: Record<string, string>): string {
  return Object.values(dimensions).join(' · ');
}

/** The release state in words. "Release candidate", never a bare "Candidate", which a project may use as a page name. */
export function releaseStateLabel(state: 'candidate' | 'released'): string {
  return state === 'released' ? 'Released' : 'Release candidate';
}

/** "5 days before this build" when the run finished at least a whole day before the build, otherwise undefined. */
export function runAgeAtBuild(runFinishedAt: string, builtAt: string): string | undefined {
  const days = Math.floor((Date.parse(builtAt) - Date.parse(runFinishedAt)) / 86_400_000);
  if (!Number.isFinite(days) || days < 1) return undefined;
  return `${days} ${days === 1 ? 'day' : 'days'} before this build`;
}

/** "14 Oct 2026 · pixelmatch 7.2.0 · 5 days before this build". */
export function describeRun(run: { finishedAt: string; engine: { name: string; version?: string | undefined } }, builtAt: string): string {
  const age = runAgeAtBuild(run.finishedAt, builtAt);
  return [formatDate(run.finishedAt), `${run.engine.name}${run.engine.version ? ` ${run.engine.version}` : ''}`, age].filter(Boolean).join(' · ');
}

/** "3 runs", or "3 runs, the oldest 5 days before this build". */
export function describeRuns(runs: Array<{ finishedAt: string }>, builtAt: string): string {
  const oldest = runs.map((run) => run.finishedAt).sort()[0];
  const age = oldest ? runAgeAtBuild(oldest, builtAt) : undefined;
  return `${runs.length} runs${age ? `, the oldest ${age}` : ''}`;
}
