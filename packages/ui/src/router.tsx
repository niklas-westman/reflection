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
 * The hash route for a plain path such as /bundles/<id>, which someone pasted without the "#".
 * Undefined when the address already is the app's root or carries a hash.
 */
export function hashRouteForPlainPath(pathname: string, hash: string, basePath: string): string | undefined {
  if (hash !== '' || !pathname.startsWith(basePath)) return undefined;
  const route = pathname.slice(basePath.length).replace(/^\/*/, '/');
  return route === '/' || route === '/index.html' ? undefined : `${basePath}#${route}`;
}

export function createAppRouter(history = createHashHistory()): AnyRouter {
  return createRouter({ routeTree, history });
}
