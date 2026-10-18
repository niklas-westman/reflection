import { createHashHistory, createRootRoute, createRoute, createRouter, Outlet, type AnyRouter } from '@tanstack/react-router';
import { BundleIndex, BundleLayout } from './routes/bundle-layout';
import { BundleListPage } from './routes/bundle-list-page';
import { ComparisonPage } from './routes/comparison-page';
import { SubjectPage } from './routes/subject-page';

const rootRoute = createRootRoute({ component: Outlet });

const bundlesRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: BundleListPage });
const bundleRoute = createRoute({ getParentRoute: () => rootRoute, path: 'bundles/$bundleId', component: BundleLayout });
const bundleIndexRoute = createRoute({ getParentRoute: () => bundleRoute, path: '/', component: BundleIndex });
const subjectRoute = createRoute({
  getParentRoute: () => bundleRoute,
  path: 'subjects/$subjectId',
  // The page parses the search itself and falls back to defaults, so any value is accepted here.
  validateSearch: (search: Record<string, unknown>) => search,
  component: SubjectPage
});
const comparisonRoute = createRoute({ getParentRoute: () => bundleRoute, path: 'subjects/$subjectId/comparisons/$comparisonId', component: ComparisonPage });

const routeTree = rootRoute.addChildren([bundlesRoute, bundleRoute.addChildren([bundleIndexRoute, subjectRoute, comparisonRoute])]);

/** Hash history keeps links working on any static host, with no server rewrite rules. */
export function createAppRouter(history = createHashHistory()): AnyRouter {
  return createRouter({ routeTree, history });
}
