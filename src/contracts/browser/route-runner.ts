import type { Browser, Page } from 'playwright';
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
  setup?: BrowserSetup | undefined;
};

export type BrowserSetup = {
  localStorage?: Record<string, string>;
  sessionStorage?: Record<string, string>;
};

export type RouteRunInput = {
  browser: Browser;
  store: ArtifactStore;
  baseUrl: string;
  route: BrowserRoute;
  viewport: string;
  blocking: boolean;
  maskSelectors?: string[];
  setup?: BrowserSetup | undefined;
};

export async function runBrowserRoute(input: RouteRunInput): Promise<CheckResult> {
  const context = await createBrowserContext(input.browser, input.viewport);
  const page = await context.newPage();
  const consoleObserver = observeConsoleErrors(page);
  const failures: AssertionFailure[] = [];
  const artifacts = [];
  const maskSelectors = input.maskSelectors ?? [];
  let maskedSelectors: string[] = [];
  const setup = mergeBrowserSetup(input.setup, input.route.setup);
  const setupMetadata = createSetupMetadata(setup);

  try {
    await applyBrowserSetup(page, setup);
    await page.goto(new URL(input.route.path, input.baseUrl).toString(), { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 2_000 }).catch(() => undefined);

    for (const expectation of input.route.expects) {
      const failure = await evaluateExpectation(page, expectation, consoleObserver.errors);
      if (failure) {
        failures.push(failure);
      }
    }

    if (shouldCaptureScreenshot(input.route.expects)) {
      maskedSelectors = await applyMaskSelectors(page, maskSelectors);
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
        failures,
        privacyWarning: shouldCaptureScreenshot(input.route.expects) ? 'Screenshots may contain private UI data. Use maskSelectors for sensitive regions.' : undefined,
        maskSelectors,
        maskedSelectors,
        setup: setupMetadata
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
      failures,
      setup: setupMetadata,
      ...(shouldCaptureScreenshot(input.route.expects)
        ? {
            privacyWarning: 'Screenshots may contain private UI data. Use maskSelectors for sensitive regions.',
            maskSelectors,
            maskedSelectors
          }
        : {})
    },
    ...(failures.length > 0 ? { suggestedNextStep: 'Inspect screenshot and browser metadata, then fix the rendered UI contract failure.' } : {})
  };
}

function mergeBrowserSetup(base: BrowserSetup | undefined, route: BrowserSetup | undefined): BrowserSetup {
  return {
    localStorage: {
      ...(base?.localStorage ?? {}),
      ...(route?.localStorage ?? {})
    },
    sessionStorage: {
      ...(base?.sessionStorage ?? {}),
      ...(route?.sessionStorage ?? {})
    }
  };
}

async function applyBrowserSetup(page: Page, setup: BrowserSetup): Promise<void> {
  const localStorage = setup.localStorage ?? {};
  const sessionStorage = setup.sessionStorage ?? {};

  if (Object.keys(localStorage).length === 0 && Object.keys(sessionStorage).length === 0) {
    return;
  }

  await page.addInitScript(
    (storageSetup) => {
      const target = globalThis as unknown as {
        localStorage: { setItem(key: string, value: string): void };
        sessionStorage: { setItem(key: string, value: string): void };
      };

      for (const [key, value] of Object.entries(storageSetup.localStorage)) {
        target.localStorage.setItem(key, value);
      }

      for (const [key, value] of Object.entries(storageSetup.sessionStorage)) {
        target.sessionStorage.setItem(key, value);
      }
    },
    { localStorage, sessionStorage }
  );
}

function createSetupMetadata(setup: BrowserSetup): { localStorageKeys: string[]; sessionStorageKeys: string[] } | undefined {
  const localStorageKeys = Object.keys(setup.localStorage ?? {}).sort();
  const sessionStorageKeys = Object.keys(setup.sessionStorage ?? {}).sort();

  if (localStorageKeys.length === 0 && sessionStorageKeys.length === 0) {
    return undefined;
  }

  return { localStorageKeys, sessionStorageKeys };
}

async function applyMaskSelectors(page: Page, selectors: string[]): Promise<string[]> {
  const applied: string[] = [];

  for (const selector of selectors) {
    const count = await page.locator(selector).count().catch(() => 0);
    if (count === 0) {
      continue;
    }

    await page.locator(selector).evaluateAll((elements) => {
      for (const element of elements) {
        const target = element as unknown as { getAttribute(name: string): string | null; setAttribute(name: string, value: string): void };
        const previousStyle = target.getAttribute('style') ?? '';
        target.setAttribute('style', `${previousStyle}; visibility: hidden !important;`);
      }
    });
    applied.push(selector);
  }

  return applied;
}
