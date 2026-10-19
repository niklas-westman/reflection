import { createHashHistory, createRootRoute, createRoute, createRouter, Outlet, type AnyRouter } from '@tanstack/react-router';
import { BundleLayout } from './routes/bundle-layout';
import { BundleListPage } from './routes/bundle-list-page';
import { ChangesPage } from './routes/changes-page';
import { ComparisonPage } from './routes/comparison-page';
import { ReleaseOverviewPage } from './routes/release-overview-page';
import { SubjectPage } from './routes/subject-page';

const rootRoute = createRootRoute({ component: Outlet });

const bundlesRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: BundleListPage });
const bundleRoute = createRoute({ getParentRoute: () => rootRoute, path: 'bundles/$bundleId', component: BundleLayout });
const overviewRoute = createRoute({ getParentRoute: () => bundleRoute, path: '/', component: ReleaseOverviewPage });
const changesRoute = createRoute({ getParentRoute: () => bundleRoute, path: 'changes', component: ChangesPage });
// $section is "components" or "pages"; the page checks it and sends a subject to the section it belongs to.
const subjectRoute = createRoute({
  getParentRoute: () => bundleRoute,
  path: '$section/$subjectId',
  // The page parses the search itself and falls back to defaults, so any value is accepted here.
  validateSearch: (search: Record<string, unknown>) => search,
  component: SubjectPage
});
const comparisonRoute = createRoute({ getParentRoute: () => bundleRoute, path: '$section/$subjectId/comparisons/$comparisonId', component: ComparisonPage });

const routeTree = rootRoute.addChildren([bundlesRoute, bundleRoute.addChildren([overviewRoute, changesRoute, subjectRoute, comparisonRoute])]);

/** Hash history keeps links working on any static host, with no server rewrite rules. */
export function createAppRouter(history = createHashHistory()): AnyRouter {
  return createRouter({ routeTree, history });
}
