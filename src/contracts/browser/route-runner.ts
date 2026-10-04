import type { Browser, Page } from 'playwright';
import type { ArtifactStore } from '../../core/artifact-store.js';
import type { ArtifactRef, CheckResult } from '../../core/report-schema.js';
import type { BrowserStability, BrowserStep, ClockSetup, MaskSelector, NetworkSetup } from '../../core/browser-scenario.js';
import { redactUrl } from '../../core/redact-url.js';
import type { RouteViewport } from '../../core/viewport.js';
import { createBrowserContext, defaultBrowserContextOptions, resolveRouteViewport } from '../../integrations/playwright/context-factory.js';
import { describeExpectation, evaluateExpectation, shouldCaptureScreenshot, type AssertionFailure, type BrowserExpectation } from './assertions.js';
import { observeConsoleErrors } from './console-observer.js';
import { installNetworkFixtures } from './network-fixtures.js';
import { resolveStability, screenshotStabilityOptions, waitForPageStability } from './stability.js';
import { runSteps } from './steps.js';

export type BrowserRoute = {
  id: string;
  name?: string | undefined;
  path: string;
  viewports: RouteViewport[];
  capture?: { fullPage?: boolean | undefined } | undefined;
  stability?: BrowserStability | undefined;
  maskSelectors?: MaskSelector[] | undefined;
  expects: BrowserExpectation[];
  states?: BrowserRouteState[] | undefined;
  setup?: BrowserSetup | undefined;
};

export type BrowserRouteState = {
  id: string;
  name?: string | undefined;
  path?: string | undefined;
  steps?: BrowserStep[] | undefined;
  expects?: BrowserExpectation[] | undefined;
  maskSelectors?: MaskSelector[] | undefined;
  setup?: BrowserSetup | undefined;
};

export type ExpectationResult = {
  expectation: string;
  status: 'pass' | 'fail';
  message?: string;
};

type ResolvedMask = { selector: string; reason?: string | undefined };

export type BrowserSetup = {
  localStorage?: Record<string, string>;
  sessionStorage?: Record<string, string>;
  network?: NetworkSetup | undefined;
  clock?: ClockSetup | undefined;
  timezone?: string | undefined;
  locale?: string | undefined;
  colorScheme?: 'light' | 'dark' | undefined;
  reducedMotion?: 'reduce' | 'no-preference' | undefined;
};

export type RouteRunInput = {
  browser: Browser;
  store: ArtifactStore;
  baseUrl: string;
  route: BrowserRoute;
  viewport: RouteViewport;
  state?: BrowserRouteState | undefined;
  blocking: boolean;
  maskSelectors?: MaskSelector[];
  setup?: BrowserSetup | undefined;
  stability?: BrowserStability | undefined;
  configDir?: string | undefined;
  visualCaptures?: RouteVisualCaptureRequest[] | undefined;
};

export type RouteVisualCaptureRequest = {
  id: string;
  selector: string;
  scenario?: string | undefined;
};

export type RouteVisualCaptureResult = {
  caseId: string;
  routeId: string;
  viewport: string;
  target: string;
  artifact: ArtifactRef;
  scenario?: string | undefined;
};

export type BrowserRouteRunResult = {
  check: CheckResult;
  visualCaptures: RouteVisualCaptureResult[];
};

export async function runBrowserRoute(input: RouteRunInput): Promise<BrowserRouteRunResult> {
  const resolvedViewport = resolveRouteViewport(input.viewport);
  const viewportName = resolvedViewport.name;
  const state = input.state;
  const stateSuffix = state ? `.${state.id}` : '';
  const artifactDir = `browser/${input.route.id}/${viewportName}${state ? `/${state.id}` : ''}`;
  const visitedPath = state?.path ?? input.route.path;
  const targetLabel = `${visitedPath} ${viewportName}${state ? ` ${state.id}` : ''}`;
  const expects = [...input.route.expects, ...(state?.expects ?? [])];
  // Design frames are fixed-size; full-page capture would make the PNG taller than the frame and break exact-dimension baselines.
  const fullPage = input.route.capture?.fullPage ?? !resolvedViewport.isCustomSize;
  const setup = mergeBrowserSetup(mergeBrowserSetup(input.setup, input.route.setup), state?.setup);
  const masks = resolveMasks(input.maskSelectors, input.route.maskSelectors, state?.maskSelectors);
  const expectationResults: ExpectationResult[] = [];
  const stability = resolveStability(input.stability, input.route.stability);
  const screenshotOptions = { ...screenshotStabilityOptions(stability), fullPage };
  const context = await createBrowserContext(input.browser, viewportName, resolvedViewport.size, {
    locale: setup.locale,
    timezone: setup.timezone,
    colorScheme: setup.colorScheme,
    reducedMotion: setup.reducedMotion
  });
  const page = await context.newPage();
  const consoleObserver = observeConsoleErrors(page);
  const failures: AssertionFailure[] = [];
  const warnings: string[] = [];
  const artifacts = [];
  const maskSelectors = masks.map((mask) => mask.selector);
  let maskedSelectors: string[] = [];
  const visualCaptures: RouteVisualCaptureResult[] = [];
  const visualCaptureRequests = input.visualCaptures ?? [];
  let networkFixtures: Awaited<ReturnType<typeof installNetworkFixtures>> | undefined;
  let finalUrl: string | undefined;

  try {
    if (setup.clock) {
      await context.clock.setFixedTime(new Date(setup.clock.now));
    }
    networkFixtures = await installNetworkFixtures({
      context,
      network: setup.network,
      baseUrl: input.baseUrl,
      configDir: input.configDir ?? process.cwd()
    });
    await applyBrowserSetup(page, setup);
    await page.goto(new URL(visitedPath, input.baseUrl).toString(), { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 2_000 }).catch(() => undefined);

    const stepFailure = state?.steps?.length ? await runSteps(page, state.steps) : undefined;
    if (stepFailure) {
      failures.push({
        classification: 'step-failure',
        summary: `State "${state?.id}" step ${stepFailure.index} (${stepFailure.description}) failed: ${stepFailure.message}`
      });
      artifacts.push(await input.store.writeBuffer(`${artifactDir}/failure.png`, await page.screenshot(screenshotOptions)));
    } else {
      for (const expectation of expects) {
        const failure = await evaluateExpectation(page, expectation, consoleObserver.errors);
        expectationResults.push({
          expectation: describeExpectation(expectation),
          status: failure ? 'fail' : 'pass',
          ...(failure ? { message: failure.summary } : {})
        });
        if (failure) {
          failures.push(failure);
        }
      }
    }

    if (!stepFailure && (shouldCaptureScreenshot(expects) || visualCaptureRequests.length > 0)) {
      maskedSelectors = await applyMaskSelectors(page, maskSelectors);
      await waitForPageStability(page, stability);
    }

    if (!stepFailure) {
      for (const capture of visualCaptureRequests) {
        const locator = page.locator(capture.selector).first();
        if (!(await locator.isVisible().catch(() => false))) {
          continue;
        }
        const artifact = await input.store.writeBuffer(
          `visual/${capture.id}/actual.png`,
          await locator.screenshot(screenshotStabilityOptions(stability))
        );
        visualCaptures.push({
          caseId: capture.id,
          routeId: input.route.id,
          viewport: viewportName,
          target: targetLabel,
          artifact,
          ...(capture.scenario ? { scenario: capture.scenario } : {})
        });
      }

      if (shouldCaptureScreenshot(expects)) {
        const screenshot = await page.screenshot(screenshotOptions);
        artifacts.push(await input.store.writeBuffer(`${artifactDir}/actual.png`, screenshot));
      }
    }

    finalUrl = redactUrl(page.url());
    collectUnmatchedRequests(networkFixtures, setup, failures, warnings);

    const setupMetadata = createSetupMetadata(setup, networkFixtures);
    artifacts.push(
      await input.store.writeJson(`${artifactDir}/metadata.json`, {
        route: visitedPath,
        viewport: viewportName,
        ...(state ? { state: state.id } : {}),
        viewportSize: resolvedViewport.size,
        fullPage,
        url: redactUrl(page.url()),
        expectations: expectationResults,
        masks: describeMasks(masks, maskedSelectors),
        consoleErrors: consoleObserver.errors,
        failures,
        privacyWarning: shouldCaptureScreenshot(expects) ? 'Screenshots may contain private UI data. Use maskSelectors for sensitive regions.' : undefined,
        maskSelectors,
        maskedSelectors,
        setup: setupMetadata,
        stability
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
  const status = failures.length > 0 ? 'fail' : warnings.length > 0 ? 'warn' : 'pass';
  const displayName = `${input.route.name ?? input.route.id}${state ? ` (${state.name ?? state.id})` : ''}`;
  const setupMetadata = createSetupMetadata(setup, networkFixtures);

  return {
    check: {
      id: `browser.${input.route.id}.${viewportName}${stateSuffix}`,
      suite: 'browser',
      target: targetLabel,
      status,
      severity: status !== 'warn' && input.blocking ? 'blocking' : 'review',
      summary:
        status === 'pass'
          ? `${displayName} rendered on ${viewportName}.`
          : status === 'warn'
            ? `${displayName} rendered on ${viewportName} with ${warnings.length} warning${warnings.length === 1 ? '' : 's'}.`
            : firstFailure?.summary ?? `${displayName} failed on ${viewportName}.`,
      ...(failures.length > 0 || warnings.length > 0
        ? { details: [...failures.map((failure) => failure.details ?? failure.summary), ...warnings].join('\n') }
        : {}),
      artifacts,
      metadata: {
        route: visitedPath,
        routeId: input.route.id,
        viewport: viewportName,
        ...(state ? { state: state.id } : {}),
        ...(finalUrl ? { finalUrl } : {}),
        expectations: expectationResults,
        classification: firstFailure?.classification,
        failures,
        setup: setupMetadata,
        environment: createCheckEnvironment(resolvedViewport.size, setup),
        stability,
        ...(shouldCaptureScreenshot(expects)
          ? {
              privacyWarning: 'Screenshots may contain private UI data. Use maskSelectors for sensitive regions.',
              maskSelectors,
              maskedSelectors,
              masks: describeMasks(masks, maskedSelectors)
            }
          : {})
      },
      ...(failures.length > 0 ? { suggestedNextStep: 'Inspect screenshot and browser metadata, then fix the rendered UI contract failure.' } : {})
    },
    visualCaptures
  };
}

function resolveMasks(...layers: Array<MaskSelector[] | undefined>): ResolvedMask[] {
  const bySelector = new Map<string, ResolvedMask>();
  for (const layer of layers) {
    for (const entry of layer ?? []) {
      const mask = typeof entry === 'string' ? { selector: entry } : entry;
      const existing = bySelector.get(mask.selector);
      bySelector.set(mask.selector, { selector: mask.selector, reason: mask.reason ?? existing?.reason });
    }
  }
  return [...bySelector.values()];
}

function describeMasks(masks: ResolvedMask[], applied: string[]): Array<{ selector: string; reason?: string; applied: boolean }> {
  return masks.map((mask) => ({ selector: mask.selector, ...(mask.reason ? { reason: mask.reason } : {}), applied: applied.includes(mask.selector) }));
}

function collectUnmatchedRequests(
  networkFixtures: Awaited<ReturnType<typeof installNetworkFixtures>> | undefined,
  setup: BrowserSetup,
  failures: AssertionFailure[],
  warnings: string[]
): void {
  const unmatched = networkFixtures?.unmatchedRequests() ?? [];
  if (unmatched.length === 0) {
    return;
  }

  const listing = unmatched.map((request) => `${request.method} ${request.url}`).join('\n');
  if (setup.network?.unmatched === 'fail') {
    failures.push({
      classification: 'unexpected-network-request',
      summary: `${unmatched.length} network request${unmatched.length === 1 ? '' : 's'} had no matching stub.`,
      details: `Unmatched requests:\n${listing}`
    });
    return;
  }

  warnings.push(`Unmatched requests (no stub):\n${listing}`);
}

function createCheckEnvironment(viewportSize: { width: number; height: number }, setup: BrowserSetup): Record<string, unknown> {
  return {
    viewportSize,
    deviceScaleFactor: 1,
    locale: setup.locale ?? defaultBrowserContextOptions.locale,
    timezone: setup.timezone ?? defaultBrowserContextOptions.timezone,
    colorScheme: setup.colorScheme ?? defaultBrowserContextOptions.colorScheme,
    reducedMotion: setup.reducedMotion ?? 'no-preference',
    clockFixed: setup.clock !== undefined,
    ...(setup.clock ? { clockNow: setup.clock.now } : {})
  };
}

function mergeBrowserSetup(base: BrowserSetup | undefined, route: BrowserSetup | undefined): BrowserSetup {
  const stubs = [...(base?.network?.stubs ?? []), ...(route?.network?.stubs ?? [])];
  const unmatched = route?.network?.unmatched ?? base?.network?.unmatched;
  const allowOrigins = [...(base?.network?.allowOrigins ?? []), ...(route?.network?.allowOrigins ?? [])];
  const hasNetwork = base?.network !== undefined || route?.network !== undefined;
  const clock = route?.clock ?? base?.clock;
  const timezone = route?.timezone ?? base?.timezone;
  const locale = route?.locale ?? base?.locale;
  const colorScheme = route?.colorScheme ?? base?.colorScheme;
  const reducedMotion = route?.reducedMotion ?? base?.reducedMotion;

  return {
    localStorage: {
      ...(base?.localStorage ?? {}),
      ...(route?.localStorage ?? {})
    },
    sessionStorage: {
      ...(base?.sessionStorage ?? {}),
      ...(route?.sessionStorage ?? {})
    },
    ...(hasNetwork ? { network: { stubs, ...(unmatched ? { unmatched } : {}), allowOrigins } } : {}),
    ...(clock ? { clock } : {}),
    ...(timezone ? { timezone } : {}),
    ...(locale ? { locale } : {}),
    ...(colorScheme ? { colorScheme } : {}),
    ...(reducedMotion ? { reducedMotion } : {})
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

function createSetupMetadata(setup: BrowserSetup, networkFixtures: Awaited<ReturnType<typeof installNetworkFixtures>> | undefined): Record<string, unknown> | undefined {
  const localStorageKeys = Object.keys(setup.localStorage ?? {}).sort();
  const sessionStorageKeys = Object.keys(setup.sessionStorage ?? {}).sort();
  const network = networkFixtures?.summary();
  const hasContextSetup = setup.clock || setup.timezone || setup.locale || setup.colorScheme || setup.reducedMotion;

  if (localStorageKeys.length === 0 && sessionStorageKeys.length === 0 && !network && !hasContextSetup) {
    return undefined;
  }

  return {
    localStorageKeys,
    sessionStorageKeys,
    ...(network ? { network } : {}),
    ...(setup.clock ? { clock: setup.clock } : {}),
    ...(setup.timezone ? { timezone: setup.timezone } : {}),
    ...(setup.locale ? { locale: setup.locale } : {}),
    ...(setup.colorScheme ? { colorScheme: setup.colorScheme } : {}),
    ...(setup.reducedMotion ? { reducedMotion: setup.reducedMotion } : {})
  };
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
