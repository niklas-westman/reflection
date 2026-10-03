import type { ReflectionConfig, RunMode } from './config.js';

export interface RunFilter {
  routes: string[];
  states: string[];
  cases: string[];
}

export interface FilteredConfig {
  config: ReflectionConfig;
  unmatched: { routes: string[]; states: string[]; cases: string[] };
}

export function hasRunFilter(filter: RunFilter): boolean {
  return filter.routes.length > 0 || filter.states.length > 0 || filter.cases.length > 0;
}

/**
 * Narrows the config to the requested routes, states and cases. Filters combine with AND.
 * Design commands are not addressable by these ids, so an active filter drops them.
 */
export function applyRunFilter(config: ReflectionConfig, filter: RunFilter): FilteredConfig {
  if (!hasRunFilter(filter)) {
    return { config, unmatched: { routes: [], states: [], cases: [] } };
  }

  const { browser, component, print, design } = config.contracts;
  const routeFilterActive = filter.routes.length > 0;
  const stateFilterActive = filter.states.length > 0;
  const caseFilterActive = filter.cases.length > 0;
  const matchesRoute = (routeId: string): boolean => !routeFilterActive || filter.routes.includes(routeId);

  let routes = (browser?.routes ?? []).filter((route) => matchesRoute(route.id));
  if (stateFilterActive) {
    routes = routes
      .filter((route) => route.states?.some((state) => filter.states.includes(state.id)))
      .map((route) => ({ ...route, states: route.states?.filter((state) => filter.states.includes(state.id)) }));
  }

  let visualSmoke = (browser?.visualSmoke ?? []).filter(
    (visualCase) =>
      matchesRoute(visualCase.route) &&
      (!stateFilterActive || (visualCase.state !== undefined && filter.states.includes(visualCase.state))) &&
      (!caseFilterActive || filter.cases.includes(visualCase.id))
  );
  let printCases = (print?.cases ?? []).filter((printCase) => matchesRoute(printCase.route) && (!caseFilterActive || filter.cases.includes(printCase.id)));
  // Component cases have no route or state, so route/state filters exclude them.
  const componentCases = routeFilterActive || stateFilterActive ? [] : (component?.cases ?? []).filter((componentCase) => !caseFilterActive || filter.cases.includes(componentCase.id));

  if (caseFilterActive) {
    // Only run routes (and states) that a selected case needs.
    const neededRouteIds = new Set([...visualSmoke.map((visualCase) => visualCase.route), ...printCases.map((printCase) => printCase.route)]);
    routes = routes
      .filter((route) => neededRouteIds.has(route.id))
      .map((route) => {
        if (!route.states) {
          return route;
        }
        const neededStates = new Set(visualSmoke.filter((visualCase) => visualCase.route === route.id).map((visualCase) => visualCase.state));
        const printNeedsRoute = printCases.some((printCase) => printCase.route === route.id);
        return { ...route, states: printNeedsRoute ? route.states : route.states.filter((state) => neededStates.has(state.id)) };
      })
      .filter((route) => !route.states || route.states.length > 0);
    visualSmoke = visualSmoke.filter((visualCase) => routes.some((route) => route.id === visualCase.route));
    printCases = printCases.filter((printCase) => routes.some((route) => route.id === printCase.route));
  }

  const knownRouteIds = new Set((browser?.routes ?? []).map((route) => route.id));
  const knownStateIds = new Set((browser?.routes ?? []).flatMap((route) => (route.states ?? []).map((state) => state.id)));
  const knownCaseIds = new Set([
    ...(browser?.visualSmoke ?? []).map((visualCase) => visualCase.id),
    ...(component?.cases ?? []).map((componentCase) => componentCase.id),
    ...(print?.cases ?? []).map((printCase) => printCase.id)
  ]);

  return {
    config: {
      ...config,
      contracts: {
        ...config.contracts,
        ...(browser ? { browser: { ...browser, routes, visualSmoke } } : {}),
        ...(component ? { component: { ...component, cases: componentCases } } : {}),
        ...(print ? { print: { ...print, cases: printCases } } : {}),
        ...(design ? { design: { ...design, commands: [] } } : {})
      }
    },
    unmatched: {
      routes: filter.routes.filter((id) => !knownRouteIds.has(id)),
      states: filter.states.filter((id) => !knownStateIds.has(id)),
      cases: filter.cases.filter((id) => !knownCaseIds.has(id))
    }
  };
}

export function countRunnableTargets(config: ReflectionConfig, mode: RunMode): number {
  const { browser, component, print } = config.contracts;
  const runsBrowser = (mode === 'smoke' || mode === 'full') && browser?.enabled !== false;
  const runsComponent = (mode === 'visual' || mode === 'full') && component?.enabled !== false;
  const runsPrint = (mode === 'smoke' || mode === 'print' || mode === 'full') && print?.enabled !== false;

  const browserTargets = runsBrowser
    ? (browser?.routes ?? []).reduce((total, route) => total + (route.states?.length ?? 1) * route.viewports.length, 0) + (browser?.visualSmoke.length ?? 0)
    : 0;
  return browserTargets + (runsComponent ? (component?.cases.length ?? 0) : 0) + (runsPrint ? (print?.cases.length ?? 0) : 0);
}
