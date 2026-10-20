import { createHashHistory, createRootRoute, createRoute, createRouter, Outlet, type AnyRouter } from '@tanstack/react-router';
import { ArchivePage } from './routes/archive-page';
import { BundleLayout } from './routes/bundle-layout';
import { BundleListPage } from './routes/bundle-list-page';
import { ChangesPage } from './routes/changes-page';
import { ComparisonPage } from './routes/comparison-page';
import { DesignReferencesPage } from './routes/design-references-page';
import { ReleaseOverviewPage } from './routes/release-overview-page';
import { SubjectPage } from './routes/subject-page';

const rootRoute = createRootRoute({ component: Outlet });

const bundlesRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: BundleListPage });
const bundleRoute = createRoute({ getParentRoute: () => rootRoute, path: 'bundles/$bundleId', component: BundleLayout });
const archiveRoute = createRoute({ getParentRoute: () => rootRoute, path: 'archive/$project/$release', component: ArchivePage });
const overviewRoute = createRoute({ getParentRoute: () => bundleRoute, path: '/', component: ReleaseOverviewPage });
const changesRoute = createRoute({ getParentRoute: () => bundleRoute, path: 'changes', component: ChangesPage });
const designReferencesRoute = createRoute({ getParentRoute: () => bundleRoute, path: 'design-references', component: DesignReferencesPage });
// $section is "components" or "pages"; the page checks it and sends a subject to the section it belongs to.
const subjectRoute = createRoute({
  getParentRoute: () => bundleRoute,
  path: '$section/$subjectId',
  // The page parses the search itself and falls back to defaults, so any value is accepted here.
  validateSearch: (search: Record<string, unknown>) => search,
  component: SubjectPage
});
const comparisonRoute = createRoute({ getParentRoute: () => bundleRoute, path: '$section/$subjectId/comparisons/$comparisonId', component: ComparisonPage });

const routeTree = rootRoute.addChildren([bundlesRoute, archiveRoute, bundleRoute.addChildren([overviewRoute, changesRoute, designReferencesRoute, subjectRoute, comparisonRoute])]);

/** Hash history keeps links working on any static host, with no server rewrite rules. */
/**
 * The hash route for a plain path such as /bundles/<id> or /reflection/bundles/<id>, pasted without the "#".
 * Whatever comes before the first /bundles/ or /archive/ segment is where the viewer lives, so this works under
 * any base path. Undefined when the address carries a hash or names no viewer route.
 */
export function hashRouteForPlainPath(pathname: string, hash: string): string | undefined {
  if (hash !== '') return undefined;
  const match = /^(.*?\/)((?:bundles|archive)\/.+)$/.exec(pathname);
  return match ? `${match[1]}#/${match[2]}` : undefined;
}

export function createAppRouter(history = createHashHistory()): AnyRouter {
  return createRouter({ routeTree, history });
}
