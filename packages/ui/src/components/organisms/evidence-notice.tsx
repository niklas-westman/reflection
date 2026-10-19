import type { ReactNode } from 'react';
import { useBundleView } from '../../data/bundle-context';
import type { SubjectGroup } from '../../model/subject-model';
import { Banner } from '../molecules/banner';

/**
 * At most one banner, and only when something needs attention. On a subject page it can also say that the
 * reference approvals behind that subject were not confirmed by a person.
 */
export function EvidenceNotice({ subject }: { subject?: SubjectGroup }): ReactNode {
  const { prepared, verificationFailed } = useBundleView();
  const { validity } = prepared;
  if (validity.state === 'invalid') {
    const shown = prepared.problems.slice(0, 3);
    return (
      <Banner tone="fail" title={`Some evidence in this bundle is unusable (${prepared.problems.length})`}>
        <p style={{ margin: '0.25rem 0 0' }}>Affected comparisons are counted as unknown, not as passed or failed.</p>
        <ul>
          {shown.map((problem, index) => (
            <li key={index}>
              {problem.path ? <code>{problem.path}</code> : null} {problem.message}
            </li>
          ))}
          {prepared.problems.length > shown.length ? <li>and {prepared.problems.length - shown.length} more</li> : null}
        </ul>
      </Banner>
    );
  }
  if (validity.state === 'never-run') {
    return (
      <Banner tone="idle" title="Nothing has been run for this bundle">
        <p style={{ margin: '0.25rem 0 0' }}>No run is recorded, so there is no result to show. Required items are listed without an outcome.</p>
      </Banner>
    );
  }
  if (validity.state === 'stale') {
    const shown = validity.causes.slice(0, 3);
    return (
      <Banner tone="gap" title="This evidence is stale">
        <p style={{ margin: '0.25rem 0 0' }}>Something it was produced from has changed since it was recorded. Run it again before relying on it.</p>
        <ul>
          {shown.map((cause) => (
            <li key={`${cause.role}/${cause.key}`}>
              {cause.role} <code>{cause.key}</code> {cause.change}
            </li>
          ))}
          {validity.causes.length > shown.length ? <li>and {validity.causes.length - shown.length} more</li> : null}
        </ul>
      </Banner>
    );
  }
  if (verificationFailed !== undefined) {
    return (
      <Banner tone="gap" title="Files could not be fully verified">
        <p style={{ margin: '0.25rem 0 0' }}>The bundle opened, but checking every file did not finish ({verificationFailed}). Each image is still checked when it is shown, and one that does not match is withheld.</p>
      </Banner>
    );
  }
  if (prepared.projection.inventory === 'executed-only') {
    return (
      <Banner tone="gap" title="Only checks that ran are listed">
        <p style={{ margin: '0.25rem 0 0' }}>This provider cannot declare required items, so anything that did not run is not visible here and the counts are a lower bound.</p>
      </Banner>
    );
  }
  const unconfirmed = subject ? subject.comparisons.filter((comparison) => comparison.reference?.approval.attestation === 'agent' || comparison.reference?.approval.state === 'lapsed').length : 0;
  if (unconfirmed > 0) {
    return (
      <Banner tone="gap" title="Reference approval is not confirmed by a person">
        <p style={{ margin: '0.25rem 0 0' }}>
          {unconfirmed} {unconfirmed === 1 ? 'reference was' : 'references were'} approved by an agent or no longer match the approved version. A passing comparison does not grant that approval.
        </p>
      </Banner>
    );
  }
  return null;
}
