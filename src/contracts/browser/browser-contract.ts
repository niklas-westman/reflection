import type { ArtifactStore } from '../../core/artifact-store.js';
import type { CheckResult } from '../../core/report-schema.js';
import { launchBrowser } from '../../integrations/playwright/browser-manager.js';
import { runBrowserRoute, type BrowserRoute } from './route-runner.js';

export type BrowserContractConfig = {
  enabled?: boolean;
  blocking?: boolean;
  baseUrl: string;
  routes: BrowserRoute[];
};

export async function runBrowserContract(config: BrowserContractConfig, store: ArtifactStore): Promise<CheckResult[]> {
  if (config.enabled === false) {
    return [];
  }

  const browser = await launchBrowser();
  const checks: CheckResult[] = [];

  try {
    for (const route of config.routes) {
      for (const viewport of route.viewports) {
        checks.push(
          await runBrowserRoute({
            browser,
            store,
            baseUrl: config.baseUrl,
            route,
            viewport,
            blocking: config.blocking ?? true
          })
        );
      }
    }
  } finally {
    await browser.close();
  }

  return checks;
}
