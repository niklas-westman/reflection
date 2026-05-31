import type { CheckResult } from './report-schema.js';

export type FailureClass =
  | 'route-failure'
  | 'auth-gate-failure'
  | 'dom-contract-failure'
  | 'accessibility-contract-failure'
  | 'layout-overflow'
  | 'console-error'
  | 'network-error'
  | 'visual-diff'
  | 'component-drift'
  | 'environment-mismatch'
  | 'missing-baseline'
  | 'flaky-unstable-screenshot'
  | 'artifact-redaction-warning'
  | 'tool-error';

export function classifyFailure(check: CheckResult): FailureClass | undefined {
  if (check.status !== 'fail' && check.status !== 'error') {
    return undefined;
  }

  if (check.metadata.failureClass && typeof check.metadata.failureClass === 'string') {
    return check.metadata.failureClass as FailureClass;
  }

  if (check.status === 'error') {
    return 'tool-error';
  }

  if (check.suite === 'visual') {
    return 'visual-diff';
  }

  if (check.suite === 'environment') {
    return 'environment-mismatch';
  }

  return 'dom-contract-failure';
}
