import { useMemo, type ReactNode } from 'react';
import styled from 'styled-components';
import { useBundleView } from '../data/bundle-context';
import { Pill } from '../components/atoms/pill';
import { Spacer } from '../components/atoms/spacer';
import { CoverageBar } from '../components/molecules/coverage-bar';
import { SummaryGroups } from '../components/molecules/summary-groups';
import { EvidenceNotice } from '../components/organisms/evidence-notice';
import { countComparisons } from '../model/comparison-outcome';
import { formatDate } from '../model/format';
import { groupBySubject } from '../model/subject-model';
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

const List = styled.ul`
  list-style: none;
  margin: ${({ theme }) => theme.space.xs} 0 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(18rem, 1fr));
  gap: ${({ theme }) => theme.space.sm};

  a {
    display: block;
    padding: ${({ theme }) => theme.space.sm} ${({ theme }) => theme.space.md};
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: ${({ theme }) => theme.radius.lg};
    color: inherit;
    text-decoration: none;
  }
  a:hover {
    border-color: var(--border-strong);
  }
  small {
    display: block;
    color: var(--muted);
  }
  .failing {
    color: var(--fail);
    font-weight: 600;
  }
`;

const SectionHeading = styled.h2`
  margin: ${({ theme }) => theme.space.lg} 0 0;
  font-size: ${({ theme }) => theme.font.lg};
`;

/**
 * The release landing page. Step 2 of the design adds the attention and change cards; this is the release
 * identity, the two summary panels (one unit each) and a way into every subject.
 */
export function ReleaseOverviewPage(): ReactNode {
  const { bundleId, manifest, prepared } = useBundleView();
  const { projection } = prepared;
  const subjects = useMemo(() => groupBySubject(projection), [projection]);
  const comparisons = useMemo(() => countComparisons(projection.comparisons), [projection]);
  const { release, project } = manifest;

  return (
    <>
      <Title>
        <h1>
          {project.name} {release.release}
        </h1>
        <Pill $tone={release.state === 'released' ? 'pass' : 'gap'}>{release.state === 'released' ? 'Released' : 'Candidate'}</Pill>
      </Title>
      <Facts aria-label="Provenance">
        <div>
          <dt>Build</dt>
          <dd>
            {release.build} · {formatDate(release.builtAt)}
          </dd>
        </div>
        {projection.snapshots.map((snapshot) => (
          <div key={snapshot.id}>
            <dt>{snapshot.role}</dt>
            <dd>
              {snapshot.label ?? snapshot.kind}, captured {formatDate(snapshot.capturedAt)}
            </dd>
          </div>
        ))}
        {projection.runs.length > 0 ? (
          <div>
            <dt>{projection.runs.length === 1 ? 'Run' : 'Runs'}</dt>
            <dd>{projection.runs.length === 1 && projection.runs[0] ? `${formatDate(projection.runs[0].finishedAt)} · ${projection.runs[0].engine.name}` : `${projection.runs.length} runs`}</dd>
          </div>
        ) : null}
      </Facts>
      <Spacer />
      <EvidenceNotice />
      <Spacer $size="sm" />
      <SummaryGroups items={prepared.summary} comparisons={comparisons} lowerBound={projection.inventory === 'executed-only'} />
      <Spacer $size="sm" />
      <CoverageBar summary={prepared.summary} />
      {(['components', 'pages'] as const).map((section) => (
        <SubjectList key={section} bundleId={bundleId} section={section} subjects={subjects.filter((subject) => sectionOf(subject.kind) === section)} />
      ))}
    </>
  );
}

function SubjectList({ bundleId, section, subjects }: { bundleId: string; section: Section; subjects: ReturnType<typeof groupBySubject> }): ReactNode {
  if (subjects.length === 0) {
    return null;
  }
  return (
    <section aria-label={SECTION_TITLES[section]}>
      <SectionHeading>
        {SECTION_TITLES[section]} ({subjects.length})
      </SectionHeading>
      <List>
        {subjects.map((subject) => (
          <li key={subject.id}>
            <a href={paths.subject(bundleId, subject.kind, subject.id)}>
              <strong>{subject.id}</strong>
              <small>
                <span className={subject.summary.failing > 0 ? 'failing' : undefined}>{subject.summary.failing} failing</span> · {subject.summary.required} required
              </small>
            </a>
          </li>
        ))}
      </List>
    </section>
  );
}
