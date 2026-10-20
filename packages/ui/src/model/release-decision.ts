import { evaluateDecision, type Decision, type DecisionBinding, type DecisionState } from 'reflection-projection';
import { formatDate } from './format';

export interface ReleaseDecisionView {
  // The release-level decision that stands last: approve or require changes, not withdrawn.
  decision: Decision | undefined;
  standing: DecisionState | undefined;
  title: string;
  lines: string[];
  // True when the decision was made on content that changed: it no longer applies to this build.
  lapsed: boolean;
  // Every record for the release, withdrawals included.
  recorded: number;
}

/**
 * The decision a reader should see for this release, evaluated against the bundle they are looking at.
 * Item-level imports (accepted references and deviations) are not release decisions and are left out here.
 */
export function describeReleaseDecision(decisions: Decision[], current: DecisionBinding, bundleId: string): ReleaseDecisionView {
  const withdrawn = new Set(decisions.filter((decision) => decision.kind === 'withdrawn').map((decision) => decision.target));
  const standing = decisions
    .filter((decision) => (decision.kind === 'approve' || decision.kind === 'changes-required') && !withdrawn.has(decision.id))
    .sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id))
    .at(-1);
  if (!standing) {
    return { decision: undefined, standing: undefined, title: 'No decision yet', lines: ['Nobody on the approver list has approved this release or required changes.'], lapsed: false, recorded: decisions.length };
  }

  const state = evaluateDecision(standing, current, bundleId);
  const who = `${standing.kind === 'approve' ? 'Approved' : 'Changes required'} by ${standing.by} on ${formatDate(standing.at)}.`;
  const words = standing.kind === 'changes-required' ? standing.message : standing.comment;
  const lines = [who, ...(words ? [`“${words}”`] : []), describeStanding(state)];
  return { decision: standing, standing: state, title: standing.kind === 'approve' ? 'Approved' : 'Changes required', lines, lapsed: state.state === 'lapsed', recorded: decisions.length };
}

function describeStanding(state: DecisionState): string {
  if (state.state === 'holds') return 'It was made on this build.';
  if (state.state === 'carried-forward') return `It was made on build ${state.from}; nothing it judged has changed since, so it carries forward.`;
  if (state.state === 'lapsed') {
    const shown = state.causes.slice(0, 3).map((cause) => `${cause.kind} of ${cause.id} ${cause.change}`);
    return `It was made on an earlier build and no longer applies: ${state.causes.length} ${state.causes.length === 1 ? 'thing' : 'things'} it judged changed (${shown.join('; ')}${state.causes.length > 3 ? '; …' : ''}).`;
  }
  return 'It was withdrawn.';
}
