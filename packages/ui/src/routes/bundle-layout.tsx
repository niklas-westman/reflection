import { Outlet, useParams, useRouterState } from '@tanstack/react-router';
import { useMemo, type ReactNode } from 'react';
import styled from 'styled-components';
import { BundleViewProvider } from '../data/bundle-context';
import { useBundle, useVerifiedBundle } from '../data/bundle-queries';
import { Banner } from '../components/molecules/banner';
import { AppShell, type Crumb } from '../components/organisms/app-shell';
import { ReleaseSidebar, type NavLocation } from '../components/organisms/release-sidebar';
import { ValidityPill } from '../components/organisms/validity-pill';
import { prepareBundle } from '../model/bundle-state';
import { groupBySubject } from '../model/subject-model';
import { isSection, paths, SECTION_TITLES } from './paths';

const Content = styled.main`
  flex: 1;
  min-width: 0;
  overflow: auto;
  padding: ${({ theme }) => theme.space.lg} ${({ theme }) => theme.space.xl} ${({ theme }) => theme.space.xl};
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
  const { section, subjectId } = useParams({ strict: false });
  const pathname = useRouterState({ select: (state) => state.location.pathname });
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
    crumbs.push({ label: SECTION_TITLES[location.section] }, { label: current?.label ?? location.subjectId });
  } else if (location.page === 'changes') {
    crumbs.push({ label: 'Changes' });
  } else if (location.page === 'design-references') {
    crumbs.push({ label: 'Design references' });
  }

  return (
    <BundleViewProvider value={view}>
      <AppShell crumbs={crumbs} status={<ValidityPill validity={view.prepared.validity} verifying={verifying} verificationFailed={verificationFailed !== undefined} />}>
        <ReleaseSidebar bundleId={bundleId} manifest={result.bundle.manifest} subjects={subjects} location={location} />
        <Content>
          <Outlet />
        </Content>
      </AppShell>
    </BundleViewProvider>
  );
}
