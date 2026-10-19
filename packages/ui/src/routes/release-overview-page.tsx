import { useMemo, useState, type ReactNode } from 'react';
import styled from 'styled-components';
import type { Delta } from 'reflection-projection';
import { useBundleView } from '../data/bundle-context';
import { Button } from '../components/atoms/button';
import { Pill } from '../components/atoms/pill';
import { Spacer } from '../components/atoms/spacer';
import { CoverageBar } from '../components/molecules/coverage-bar';
import { Banner } from '../components/molecules/banner';
import { SubjectCard } from '../components/molecules/subject-card';
import { SummaryGroups } from '../components/molecules/summary-groups';
import { EvidenceNotice } from '../components/organisms/evidence-notice';
import { AttentionCard, ChangesCard, DesignChangesCard } from '../components/organisms/release-cards';
import { useReleaseDiff } from '../data/release-diff';
import { ExternalLink } from '../components/atoms/external-link';
import type { ChangeKind } from 'reflection-projection';
import { buildAttention, countDelegatedApprovals, sortByAttention } from '../model/attention';
import { countComparisons } from '../model/comparison-outcome';
import { describeRun, describeRuns, formatDate, releaseStateLabel } from '../model/format';
import { groupBySubject, type SubjectGroup } from '../model/subject-model';
import { paths, SECTION_TITLES, sectionOf, type Section } from './paths';

const Title = styled.div`
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.space.sm};

  h1 {
    margin: 0;
    font-size: ${({ theme }) => theme.font.xl};
    letter-spacing: -0.02em;
    font-weight: 650;
  }
`;

const Lead = styled.p`
  margin: ${({ theme }) => theme.space.xxs} 0 0;
  color: var(--muted);
`;

const Facts = styled.dl`
  display: flex;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.space.xs} ${({ theme }) => theme.space.xl};
  margin: ${({ theme }) => theme.space.sm} 0 0;

  dt {
    color: var(--muted);
    font-size: ${({ theme }) => theme.font.xs};
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  dd {
    margin: 0.125rem 0 0;
    font-size: ${({ theme }) => theme.font.sm};
  }
`;

const SectionHeading = styled.h2`
  margin: ${({ theme }) => theme.space.lg} 0 ${({ theme }) => theme.space.sm};
  font-size: ${({ theme }) => theme.font.lg};
`;

const Cards = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(20rem, 1fr));
  gap: ${({ theme }) => theme.space.sm};
`;

const SHOWN_AT_FIRST = 12;

export function ReleaseOverviewPage(): ReactNode {
  const { bundleId, manifest, prepared } = useBundleView();
  const { projection } = prepared;
  const subjects = useMemo(() => groupBySubject(projection), [projection]);
  const comparisons = useMemo(() => countComparisons(projection.comparisons), [projection]);
  const attention = useMemo(() => buildAttention({ projection, subjects, unusableComparisonIds: prepared.unusableComparisonIds }), [projection, subjects, prepared]);
  const delegatedApprovals = countDelegatedApprovals(projection);
  const { release, project } = manifest;
  const diffState = useReleaseDiff();
  const delta = projection.delta;
  // Only a delta against a known previous release says anything; the first release has nothing to compare with.
  const comparableDelta = delta && delta.against !== null ? (delta as Delta & { against: string }) : undefined;

  return (
    <>
      <Title>
        <h1>
          {project.name} {release.release}
        </h1>
        <Pill $tone={release.state === 'released' ? 'pass' : 'gap'}>{releaseStateLabel(release.state)}</Pill>
      </Title>
      <Lead>Review what this release proves and what still needs attention.</Lead>
      <Facts aria-label="Provenance">
        <div>
          <dt>Build</dt>
          <dd>
            {release.build} · {formatDate(release.builtAt)}
          </dd>
        </div>
        {release.branch || release.commit ? (
          <div>
            <dt>Source</dt>
            <dd>{[release.branch, release.commit?.slice(0, 7)].filter(Boolean).join(' · ')}</dd>
          </div>
        ) : null}
        {projection.snapshots.map((snapshot) => (
          <div key={snapshot.id}>
            <dt>{snapshot.role}</dt>
            <dd>
              {snapshot.label ?? snapshot.kind}, captured {formatDate(snapshot.capturedAt)}
              {snapshot.sourceUrl ? <> · <ExternalLink href={snapshot.sourceUrl}>Open</ExternalLink></> : null}
            </dd>
          </div>
        ))}
        {projection.runs.length > 0 ? (
          <div>
            <dt>{projection.runs.length === 1 ? 'Run' : 'Runs'}</dt>
            <dd>{projection.runs.length === 1 && projection.runs[0] ? describeRun(projection.runs[0], release.builtAt) : describeRuns(projection.runs, release.builtAt)}</dd>
          </div>
        ) : null}
        {projection.runs.length === 1 && projection.runs[0]?.nativeValidity ? (
          <div>
            <dt>Native validity</dt>
            <dd>
              {projection.runs[0].nativeValidity} <span className="muted">(the tool's own word, not trusted)</span>
            </dd>
          </div>
        ) : null}
      </Facts>
      <Spacer />
      <EvidenceNotice />
      {subjects.length === 0 && projection.requirements.length === 0 ? (
        <>
          <Spacer $size="sm" />
          <Banner tone="idle" title="This bundle has no required items and no comparisons">
            <p style={{ margin: '0.25rem 0 0' }}>There is nothing to show yet. The provider recorded no required items and no comparison.</p>
          </Banner>
        </>
      ) : null}
      <SectionHeading>Release status</SectionHeading>
      <SummaryGroups items={prepared.summary} comparisons={comparisons} lowerBound={projection.inventory === 'executed-only'} />
      <Spacer $size="sm" />
      <CoverageBar summary={prepared.summary} />
      <Spacer />
      <Cards role="group" aria-label="Release highlights">
        {comparableDelta ? <ChangesCard delta={comparableDelta} /> : null}
        {diffState.status === 'ready' ? <DesignChangesCard bundleId={bundleId} diff={diffState.diff} previousRelease={diffState.previousRelease} /> : null}
        <AttentionCard bundleId={bundleId} items={attention} delegatedApprovals={delegatedApprovals} />
      </Cards>
      {(['components', 'pages'] as const).map((section) => (
        <SubjectCards key={section} bundleId={bundleId} section={section} subjects={subjects.filter((subject) => sectionOf(subject.kind) === section)} changes={diffState.status === 'ready' ? new Map(diffState.diff.subjects.map((change) => [`${change.kind}/${change.id}`, change.change])) : undefined} />
      ))}
    </>
  );
}

function SubjectCards({ bundleId, section, subjects, changes }: { bundleId: string; section: Section; subjects: SubjectGroup[]; changes: Map<string, ChangeKind> | undefined }): ReactNode {
  const [showAll, setShowAll] = useState(false);
  if (subjects.length === 0) {
    return null;
  }

  const ordered = sortByAttention(subjects);
  const shown = showAll ? ordered : ordered.slice(0, SHOWN_AT_FIRST);
  return (
    <section aria-label={SECTION_TITLES[section]}>
      <SectionHeading>
        {SECTION_TITLES[section]} ({subjects.length})
      </SectionHeading>
      <Cards>
        {shown.map((subject) => (
          <SubjectCard key={subject.id} subject={subject} href={paths.subject(bundleId, subject.kind, subject.id)} change={changes?.get(`${subject.kind}/${subject.id}`)} />
        ))}
      </Cards>
      {subjects.length > SHOWN_AT_FIRST ? (
        <>
          <Spacer $size="sm" />
          <Button type="button" onClick={() => setShowAll((value) => !value)}>
            {showAll ? `Show the first ${SHOWN_AT_FIRST}` : `View all ${subjects.length} ${SECTION_TITLES[section].toLowerCase()}`}
          </Button>
        </>
      ) : null}
    </section>
  );
}
