import type { ArtifactStore } from '../../core/artifact-store.js';
import type { CheckResult } from '../../core/report-schema.js';
import type { BrowserStability } from '../../core/browser-scenario.js';
import { getRouteViewportName } from '../../core/viewport.js';
import { launchBrowser } from '../../integrations/playwright/browser-manager.js';
import { runRouteVisualSmoke } from '../visual/visual-contract.js';
import type { RouteVisualBaselineCase } from '../visual/baseline-compare.js';
import { runBrowserRoute, type BrowserRoute, type BrowserSetup, type RouteVisualCaptureResult } from './route-runner.js';

export type BrowserContractConfig = {
  enabled?: boolean;
  blocking?: boolean;
  baseUrl: string;
  routes: BrowserRoute[];
  visualSmoke?: RouteVisualBaselineCase[];
  maskSelectors?: string[];
  setup?: BrowserSetup | undefined;
  stability?: BrowserStability | undefined;
  // Base directory for relative network stub files; the run command passes the config's directory.
  configDir?: string | undefined;
};

export type BrowserContractRunResult = {
  checks: CheckResult[];
  visualCaptures: RouteVisualCaptureResult[];
  browser?: { name: string; version: string };
};

export async function runBrowserContract(config: BrowserContractConfig, store: ArtifactStore): Promise<BrowserContractRunResult> {
  if (config.enabled === false) {
    return { checks: [], visualCaptures: [] };
  }

  const browser = await launchBrowser();
  const browserIdentity = { name: browser.browserType().name(), version: browser.version() };
  const checks: CheckResult[] = [];
  const visualCaptures: RouteVisualCaptureResult[] = [];

  try {
    for (const route of config.routes) {
      const states = route.states && route.states.length > 0 ? route.states : [undefined];
      for (const viewport of route.viewports) {
        for (const state of states) {
          const result = await runBrowserRoute({
            browser,
            store,
            baseUrl: config.baseUrl,
            route,
            viewport,
            state,
            blocking: config.blocking ?? true,
            maskSelectors: config.maskSelectors ?? [],
            setup: config.setup,
            stability: config.stability,
            configDir: config.configDir,
            visualCaptures: (config.visualSmoke ?? [])
              .filter(
                (visualCase) =>
                  visualCase.route === route.id &&
                  visualCase.viewport === getRouteViewportName(viewport) &&
                  visualCase.state === state?.id &&
                  visualCase.capture?.selector
              )
              .map((visualCase) => ({
                id: visualCase.id,
                selector: visualCase.capture?.selector ?? '',
                ...(visualCase.scenario ? { scenario: visualCase.scenario } : {})
              }))
          });
          checks.push(result.check);
          visualCaptures.push(...result.visualCaptures);
        }
      }
    }
  } finally {
    await browser.close();
  }

  checks.push(
    ...(await runRouteVisualSmoke({
      visualSmoke: config.visualSmoke,
      browserChecks: checks,
      visualCaptures,
      store
    }))
  );

  return { checks, visualCaptures, browser: browserIdentity };
}
