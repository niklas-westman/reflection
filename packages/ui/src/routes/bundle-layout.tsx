import { Navigate, Outlet, useParams } from '@tanstack/react-router';
import { useMemo, type ReactNode } from 'react';
import styled from 'styled-components';
import { BundleViewProvider } from '../data/bundle-context';
import { useBundle, useVerifiedBundle } from '../data/bundle-queries';
import { Banner } from '../components/molecules/banner';
import { AppShell } from '../components/organisms/app-shell';
import { SubjectRail } from '../components/organisms/subject-rail';
import { prepareBundle } from '../model/bundle-state';
import { groupBySubject } from '../model/subject-model';
import { paths } from './paths';

const Content = styled.main`
  flex: 1;
  min-width: 0;
  overflow: auto;
  padding: ${({ theme }) => theme.space.lg} ${({ theme }) => theme.space.xl} ${({ theme }) => theme.space.xl};
`;

export function BundleLayout(): ReactNode {
  const { bundleId = '', subjectId } = useParams({ strict: false });
  const initial = useBundle(bundleId);
  const verified = useVerifiedBundle(bundleId, initial.data?.status === 'opened');
  // The quick open shows the bundle at once; the full check replaces it when it finishes.
  const bundle = verified.data ? { ...initial, data: verified.data, isPending: false as const, isError: false as const } : initial;
  const verifying = initial.data?.status === 'opened' && verified.isPending;

  if (bundle.isPending) {
    return (
      <AppShell crumbs={[{ label: 'Bundles', href: paths.bundles() }, { label: bundleId }]}>
        <Content>Loading bundle…</Content>
      </AppShell>
    );
  }
  if (bundle.isError) {
    return (
      <AppShell crumbs={[{ label: 'Bundles', href: paths.bundles() }, { label: bundleId }]}>
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
      <AppShell crumbs={[{ label: 'Bundles', href: paths.bundles() }, { label: bundleId }]}>
        <Content>
          <Banner tone="fail" title="This bundle is invalid and cannot be shown">
            <ul>
              {bundle.data.problems.map((problem, index) => (
                <li key={index}>{problem.path ? `${problem.path}: ` : ''}{problem.message}</li>
              ))}
            </ul>
          </Banner>
        </Content>
      </AppShell>
    );
  }

  return <OpenLayout bundleId={bundleId} subjectId={subjectId} result={bundle.data} verifying={verifying} />;
}

function OpenLayout({ bundleId, subjectId, result, verifying }: { bundleId: string; subjectId: string | undefined; verifying: boolean; result: Extract<NonNullable<ReturnType<typeof useBundle>['data']>, { status: 'opened' }> }): ReactNode {
  const view = useMemo(
    () => ({ bundleId, manifest: result.bundle.manifest, unusablePaths: result.bundle.unusablePaths, prepared: prepareBundle(result.bundle, result.problems), verifying }),
    [bundleId, result, verifying]
  );
  const subjects = useMemo(() => groupBySubject(view.prepared.projection), [view]);
  const { project, release } = result.bundle.manifest;

  const crumbs = [
    { label: 'Bundles', href: paths.bundles() },
    { label: `${project.name} ${release.release}`, href: paths.bundle(bundleId) },
    ...(subjectId ? [{ label: subjectId }] : [])
  ];

  return (
    <BundleViewProvider value={view}>
      <AppShell crumbs={crumbs}>
        <SubjectRail bundleId={bundleId} subjects={subjects} currentId={subjectId} />
        <Content>
          <Outlet />
        </Content>
      </AppShell>
    </BundleViewProvider>
  );
}

/** The bundle's own address has no page of its own yet: it opens its first subject. */
export function BundleIndex(): ReactNode {
  const { bundleId = '' } = useParams({ strict: false });
  const bundle = useBundle(bundleId);
  if (bundle.data?.status !== 'opened') {
    return null;
  }

  const [first] = groupBySubject(bundle.data.bundle.projection);
  if (!first) {
    return <p>This bundle has no required items and no comparisons.</p>;
  }
  return <Navigate to="/bundles/$bundleId/subjects/$subjectId" params={{ bundleId, subjectId: first.id }} replace />;
}
