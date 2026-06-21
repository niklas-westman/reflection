import type { ArtifactStore } from '../../core/artifact-store.js';
import type { CheckResult } from '../../core/report-schema.js';
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
};

export type BrowserContractRunResult = {
  checks: CheckResult[];
  visualCaptures: RouteVisualCaptureResult[];
};

export async function runBrowserContract(config: BrowserContractConfig, store: ArtifactStore): Promise<BrowserContractRunResult> {
  if (config.enabled === false) {
    return { checks: [], visualCaptures: [] };
  }

  const browser = await launchBrowser();
  const checks: CheckResult[] = [];
  const visualCaptures: RouteVisualCaptureResult[] = [];

  try {
    for (const route of config.routes) {
      for (const viewport of route.viewports) {
        const result = await runBrowserRoute({
          browser,
          store,
          baseUrl: config.baseUrl,
          route,
          viewport,
          blocking: config.blocking ?? true,
          maskSelectors: config.maskSelectors ?? [],
          setup: config.setup,
          visualCaptures: (config.visualSmoke ?? [])
            .filter((visualCase) => visualCase.route === route.id && visualCase.viewport === viewport && visualCase.capture?.selector)
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

  return { checks, visualCaptures };
}
