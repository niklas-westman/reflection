import { FailureClassSchema, type CheckResult, type FailureClass } from './report-schema.js';

export type { FailureClass } from './report-schema.js';

export function classifyFailure(check: CheckResult): FailureClass | undefined {
  if (check.status !== 'fail' && check.status !== 'error') {
    return undefined;
  }

  if (check.failureClass) {
    return check.failureClass;
  }

  if (check.metadata.failureClass && typeof check.metadata.failureClass === 'string') {
    const parsed = FailureClassSchema.safeParse(check.metadata.failureClass);
    return parsed.success ? parsed.data : 'unknown';
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
