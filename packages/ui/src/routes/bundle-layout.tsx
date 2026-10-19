import { Outlet, useParams, useRouterState } from '@tanstack/react-router';
import { useMemo, useState, type ReactNode } from 'react';
import styled from 'styled-components';
import { BundleViewProvider } from '../data/bundle-context';
import { useBundle, useVerifiedBundle } from '../data/bundle-queries';
import { Banner } from '../components/molecules/banner';
import { AppShell, type Crumb } from '../components/organisms/app-shell';
import { RELEASE_NAVIGATION_ID, ReleaseSidebar, type NavLocation } from '../components/organisms/release-sidebar';
import { NARROW_QUERY } from '../components/organisms/app-shell';
import { useMediaQuery } from '../components/atoms/use-media-query';
import { ValidityPill } from '../components/organisms/validity-pill';
import { prepareBundle } from '../model/bundle-state';
import { groupBySubject } from '../model/subject-model';
import { isSection, paths, SECTION_TITLES } from './paths';

const Content = styled.main`
  flex: 1;
  min-width: 0;
  overflow: auto;
  padding: ${({ theme }) => theme.space.lg} ${({ theme }) => theme.space.xl} ${({ theme }) => theme.space.xl};

  @media ${NARROW_QUERY} {
    padding: ${({ theme }) => theme.space.md};
  }
`;

export function BundleLayout(): ReactNode {
  const { bundleId = '' } = useParams({ strict: false });
  const initial = useBundle(bundleId);
  const verified = useVerifiedBundle(bundleId, initial.data?.status === 'opened');
  // The quick open shows the bundle at once; the full check replaces it when it finishes.
  const bundle = verified.data ? { ...initial, data: verified.data, isPending: false as const, isError: false as const } : initial;
  const verifying = initial.data?.status === 'opened' && verified.isPending;
  const verificationFailed = verified.isError ? verified.error.message : undefined;

  if (bundle.isPending) {
    return (
      <AppShell crumbs={[{ label: bundleId }]}>
        <Content>Loading bundle…</Content>
      </AppShell>
    );
  }
  if (bundle.isError) {
    return (
      <AppShell crumbs={[{ label: bundleId }]}>
        <Content>
          <Banner tone="fail" title="The bundle could not be loaded">
            <p>{bundle.error.message}</p>
          </Banner>
        </Content>
      </AppShell>
    );
  }

  // A bundle that cannot be trusted is shown as such. The viewer never falls back to another bundle.
  if (bundle.data.status === 'rejected') {
    return (
      <AppShell crumbs={[{ label: bundleId }]}>
        <Content>
          <Banner tone="fail" title="This bundle is invalid and cannot be shown">
            <ul>
              {bundle.data.problems.map((problem, index) => (
                <li key={index}>
                  {problem.path ? `${problem.path}: ` : ''}
                  {problem.message}
                </li>
              ))}
            </ul>
          </Banner>
        </Content>
      </AppShell>
    );
  }

  return <OpenLayout bundleId={bundleId} result={bundle.data} verifying={verifying} verificationFailed={verificationFailed} />;
}

type OpenedResult = Extract<NonNullable<ReturnType<typeof useBundle>['data']>, { status: 'opened' }>;

function OpenLayout({ bundleId, result, verifying, verificationFailed }: { bundleId: string; result: OpenedResult; verifying: boolean; verificationFailed: string | undefined }): ReactNode {
  const { section, subjectId, comparisonId } = useParams({ strict: false });
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const narrow = useMediaQuery(NARROW_QUERY);
  // The navigation is open by default, except on a comparison (the images need the width) and on a narrow
  // screen. A reader's choice holds until they move to another page.
  const [navigationChoice, setNavigationChoice] = useState<{ path: string; open: boolean }>();
  const navigationOpen = navigationChoice?.path === pathname ? navigationChoice.open : !(comparisonId || narrow);
  const view = useMemo(
    () => ({ bundleId, manifest: result.bundle.manifest, unusablePaths: result.bundle.unusablePaths, prepared: prepareBundle(result.bundle, result.problems), verifying, verificationFailed }),
    [bundleId, result, verifying, verificationFailed]
  );
  const subjects = useMemo(() => groupBySubject(view.prepared.projection), [view]);
  const { project, release } = result.bundle.manifest;

  const location: NavLocation = isSection(section) && subjectId ? { page: 'subject', section, subjectId } : pathname.endsWith('/changes') ? { page: 'changes' } : pathname.endsWith('/design-references') ? { page: 'design-references' } : { page: 'overview' };
  const crumbs: Crumb[] = [{ label: `${project.name} ${release.release}`, href: paths.bundle(bundleId) }];
  if (location.page === 'subject') {
    const current = subjects.find((subject) => subject.id === location.subjectId);
    crumbs.push({ label: SECTION_TITLES[location.section] }, { label: current?.label ?? location.subjectId, href: comparisonId ? paths.subject(bundleId, current?.kind ?? 'page', location.subjectId) : undefined } as Crumb);
    const comparison = comparisonId ? view.prepared.projection.comparisons.find((entry) => entry.id === comparisonId) : undefined;
    if (comparisonId) {
      const requirement = view.prepared.projection.requirements.find((entry) => entry.id === comparison?.requirementId);
      crumbs.push({ label: [requirement?.label ?? comparison?.id ?? comparisonId, comparison?.subject.adapter].filter(Boolean).join(' · ') });
    }
  } else if (location.page === 'changes') {
    crumbs.push({ label: 'Changes' });
  } else if (location.page === 'design-references') {
    crumbs.push({ label: 'Design references' });
  }

  return (
    <BundleViewProvider value={view}>
      <AppShell
        crumbs={crumbs}
        status={<ValidityPill validity={view.prepared.validity} verifying={verifying} verificationFailed={verificationFailed !== undefined} />}
        navigation={{ open: navigationOpen, controls: RELEASE_NAVIGATION_ID, onToggle: () => setNavigationChoice({ path: pathname, open: !navigationOpen }) }}
      >
        {navigationOpen ? <ReleaseSidebar bundleId={bundleId} manifest={result.bundle.manifest} subjects={subjects} location={location} /> : null}
        <Content>
          <Outlet />
        </Content>
      </AppShell>
    </BundleViewProvider>
  );
}
