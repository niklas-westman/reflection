import type { Browser } from 'playwright';
import type { ArtifactStore } from '../../core/artifact-store.js';
import type { CheckResult } from '../../core/report-schema.js';
import { createBrowserContext } from '../../integrations/playwright/context-factory.js';
import { evaluateExpectation, shouldCaptureScreenshot, type AssertionFailure, type BrowserExpectation } from './assertions.js';
import { observeConsoleErrors } from './console-observer.js';

export type BrowserRoute = {
  id: string;
  name?: string | undefined;
  path: string;
  viewports: string[];
  expects: BrowserExpectation[];
};

export type RouteRunInput = {
  browser: Browser;
  store: ArtifactStore;
  baseUrl: string;
  route: BrowserRoute;
  viewport: string;
  blocking: boolean;
};

export async function runBrowserRoute(input: RouteRunInput): Promise<CheckResult> {
  const context = await createBrowserContext(input.browser, input.viewport);
  const page = await context.newPage();
  const consoleObserver = observeConsoleErrors(page);
  const failures: AssertionFailure[] = [];
  const artifacts = [];

  try {
    await page.goto(new URL(input.route.path, input.baseUrl).toString(), { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 2_000 }).catch(() => undefined);

    for (const expectation of input.route.expects) {
      const failure = await evaluateExpectation(page, expectation, consoleObserver.errors);
      if (failure) {
        failures.push(failure);
      }
    }

    if (shouldCaptureScreenshot(input.route.expects)) {
      const screenshotPath = `browser/${input.route.id}/${input.viewport}/actual.png`;
      const screenshot = await page.screenshot({ fullPage: true });
      artifacts.push(await input.store.writeBuffer(screenshotPath, screenshot));
    }

    const metadataPath = `browser/${input.route.id}/${input.viewport}/metadata.json`;
    artifacts.push(
      await input.store.writeJson(metadataPath, {
        route: input.route.path,
        viewport: input.viewport,
        url: page.url(),
        consoleErrors: consoleObserver.errors,
        failures
      })
    );
  } catch (error) {
    failures.push({
      classification: 'route-failure',
      summary: `Route failed to render: ${error instanceof Error ? error.message : String(error)}`
    });
  } finally {
    consoleObserver.dispose();
    await context.close();
  }

  const firstFailure = failures[0];
  const status = failures.length > 0 ? 'fail' : 'pass';
  const target = `${input.route.path} ${input.viewport}`;

  return {
    id: `browser.${input.route.id}.${input.viewport}`,
    suite: 'browser',
    target,
    status,
    severity: input.blocking ? 'blocking' : 'review',
    summary:
      status === 'pass'
        ? `${input.route.name ?? input.route.id} rendered on ${input.viewport}.`
        : firstFailure?.summary ?? `${input.route.name ?? input.route.id} failed on ${input.viewport}.`,
    ...(failures.length > 0 ? { details: failures.map((failure) => failure.details ?? failure.summary).join('\n') } : {}),
    artifacts,
    metadata: {
      route: input.route.path,
      routeId: input.route.id,
      viewport: input.viewport,
      classification: firstFailure?.classification,
      failures
    },
    ...(failures.length > 0 ? { suggestedNextStep: 'Inspect screenshot and browser metadata, then fix the rendered UI contract failure.' } : {})
  };
}
