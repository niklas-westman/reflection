import { access, mkdir, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { Page } from 'playwright';
import type { ArtifactStore } from '../../core/artifact-store.js';
import { createBaselineStore, createMissingBaselineCheck } from '../../core/baseline-store.js';
import type { CheckDiagnostic, CheckResult, DiagnosticEvidence, FailureClass } from '../../core/report-schema.js';
import type { ServerConfig } from '../../core/server-manager.js';
import { createBrowserContext, type ViewportSize } from '../../integrations/playwright/context-factory.js';
import { launchBrowser } from '../../integrations/playwright/browser-manager.js';
import { startReflectionPortalServer, type PortalConfig } from '../../integrations/portal/server.js';
import { startStorybookServer } from '../../integrations/storybook/server.js';
import { resolveStoryUrl } from '../../integrations/storybook/story-url.js';
import { comparePngImages, formatVisualDiagnosticsDetails } from '../visual/image-diff.js';
import type { VisualThreshold } from '../visual/thresholds.js';

export type ComponentSource = 'storybook' | 'portal';

export type ComponentVisualCase = {
  id: string;
  storyId?: string | undefined;
  path?: string | undefined;
  baseline: string;
  baselineRoot?: string | undefined;
  viewport?: string | undefined;
  viewportSize?: ViewportSize | undefined;
  framing?: ComponentFraming | undefined;
  threshold?: VisualThreshold | undefined;
  blocking?: boolean | undefined;
  strict?: boolean | undefined;
  stateNote?: string | undefined;
  browserState?: ComponentBrowserState | undefined;
  probes?: ComponentProbes | undefined;
};

export type ComponentBrowserState = {
  kind: 'hover' | 'focus';
  selector: string;
  animationStabilization: {
    disableAnimations?: boolean | undefined;
    waitMs?: number | undefined;
  };
};

export type ComponentFraming = {
  rootSelector?: string | undefined;
  background?: string | undefined;
  align: 'center' | 'start';
  padding: number;
};

export type ComponentProbes = {
  parts: Record<string, ComponentProbePart>;
};

export type ComponentProbePart = {
  selector: string;
  bounds?: boolean | undefined;
  styles?: string[] | undefined;
  cssVariables?: string[] | undefined;
  text?: boolean | undefined;
};

type RuntimeProbePartResult = {
  selector: string;
  found: boolean;
  bounds?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  styles?: Record<string, string>;
  cssVariables?: Record<string, string>;
  font?: Record<'fontFamily' | 'fontSize' | 'fontWeight' | 'lineHeight' | 'letterSpacing', string>;
  text?: string;
};

type RuntimeProbeResult = {
  parts: Record<string, RuntimeProbePartResult>;
};

type EffectiveComponentFraming = ComponentFraming & {
  rootSelector: string;
};

export type ComponentVisualContractConfig = {
  enabled?: boolean | undefined;
  storybook?: ServerConfig | undefined;
  portal?: PortalConfig | undefined;
  cases: ComponentVisualCase[];
};

export async function runComponentVisualContract(
  config: ComponentVisualContractConfig | undefined,
  store: ArtifactStore
): Promise<CheckResult[]> {
  if (!config || config.enabled === false || config.cases.length === 0) {
    return [];
  }

  const storybookCases = config.cases.filter(isStorybookCase);
  const portalCases = config.cases.filter(isPortalCase);
  if (storybookCases.length > 0 && !config.storybook) {
    throw new Error('Storybook component visual cases require component.storybook.');
  }
  if (portalCases.length > 0 && !config.portal) {
    throw new Error('Portal component visual cases require component.portal.');
  }

  const storybook =
    storybookCases.length > 0 && config.storybook
      ? await startStorybookServer(config.storybook, {
          cwd: process.cwd(),
          logPath: store.resolveRunPath('server/storybook.log')
        })
      : undefined;
  const portal =
    portalCases.length > 0 && config.portal
      ? await startReflectionPortalServer(
          config.portal,
          portalCases.map((visualCase) => ({
            id: visualCase.id,
            path: visualCase.path,
            viewport: visualCase.viewport ?? 'component',
            viewportSize: visualCase.viewportSize,
            framing: resolveComponentFraming(visualCase.framing, 'portal')
          })),
          {
            cwd: process.cwd(),
            rootDir: store.resolveRunPath('server/portal')
          }
        )
      : undefined;
  const browser = await launchBrowser();

  try {
    const checks: CheckResult[] = [];
    for (const visualCase of storybookCases) {
      if (!storybook) continue;
      const storyUrl = resolveStoryUrl(storybook.index, storybook.baseUrl, visualCase.storyId);
      checks.push(
        await runComponentVisualCase({
          visualCase,
          componentSource: 'storybook',
          targetUrl: storyUrl,
          targetLabel: visualCase.storyId,
          store,
          browser
        })
      );
    }
    for (const visualCase of portalCases) {
      if (!portal) continue;
      const portalUrl = new URL(visualCase.path, portal.baseUrl).toString();
      checks.push(
        await runComponentVisualCase({
          visualCase,
          componentSource: 'portal',
          targetUrl: portalUrl,
          targetLabel: visualCase.path,
          store,
          browser
        })
      );
    }
    return checks;
  } finally {
    await browser.close();
    await storybook?.server.stop();
    await portal?.server.stop();
  }
}

async function runComponentVisualCase(input: {
  visualCase: ComponentVisualCase;
  componentSource: ComponentSource;
  targetUrl: string;
  targetLabel: string;
  store: ArtifactStore;
  browser: Awaited<ReturnType<typeof launchBrowser>>;
}): Promise<CheckResult> {
  const viewport = input.visualCase.viewport ?? 'component';
  const viewportSize = input.visualCase.viewportSize;
  const target = `${input.targetLabel} ${viewport}`;
  const baselinePath = resolveCaseBaselinePath(input.visualCase);
  const blocking = input.visualCase.blocking === true || input.visualCase.strict === true;
  const strict = input.visualCase.strict === true || input.visualCase.blocking === true;

  if (!(await pathExists(baselinePath))) {
    return createMissingBaselineCheck({
      id: `visual.${input.visualCase.id}`,
      target,
      baselinePath: input.visualCase.baseline,
      blocking,
      metadata: {
        ...createComponentSourceMetadata(input),
        ...createComponentMetadata(input.visualCase, input.componentSource)
      }
    });
  }

  const artifactBase = `visual/${input.visualCase.id}`;
  const expectedArtifact = await input.store.writeBuffer(`${artifactBase}/expected.png`, await readFile(baselinePath));

  try {
    const capture = await captureComponentScreenshot({
      browser: input.browser,
      store: input.store,
      path: `${artifactBase}/actual.png`,
      targetUrl: input.targetUrl,
      componentSource: input.componentSource,
      viewport,
      viewportSize,
      framing: resolveComponentFraming(input.visualCase.framing, input.componentSource),
      browserState: input.visualCase.browserState,
      probes: input.visualCase.probes
    });
    const actualArtifact = capture.artifact;
    const diffRelativePath = `${artifactBase}/diff.png`;
    const diffPath = input.store.resolveRunPath(diffRelativePath);
    await mkdir(dirname(diffPath), { recursive: true });

    const result = await comparePngImages({
      expectedPath: baselinePath,
      actualPath: input.store.resolveRunPath(actualArtifact.path),
      diffPath,
      ...(input.visualCase.threshold ? { threshold: input.visualCase.threshold } : {}),
      strict
    });
    const diffArtifact = result.diffPath ? await input.store.describeArtifact(diffRelativePath, 'visual-diff', 'diff') : undefined;
    const severity: CheckResult['severity'] = result.status === 'fail' && blocking ? 'blocking' : 'review';
    const details = result.status === 'pass' ? undefined : formatVisualDiagnosticsDetails(result.diagnostics);
    const failureClass = result.status === 'pass' ? undefined : classifyComponentVisualFailure(result, capture.runtimeProbes);
    const evidence = createComponentVisualEvidence(result, capture.runtimeProbes);
    const diagnostics = createComponentVisualDiagnostics(result, capture.runtimeProbes);
    const recommendations = createComponentVisualRecommendations(failureClass, result);

    return {
      id: `visual.${input.visualCase.id}`,
      suite: 'visual',
      target,
      status: result.status,
      severity,
      summary: createComponentVisualSummary(input.visualCase.id, result),
      ...(details ? { details } : {}),
      artifacts: [expectedArtifact, actualArtifact, ...(diffArtifact ? [diffArtifact] : [])],
      metadata: {
        ...result,
        ...createComponentSourceMetadata(input),
        viewport,
        baselinePath: input.visualCase.baseline,
        ...createComponentMetadata(input.visualCase, input.componentSource),
        ...(capture.runtimeProbes ? { runtimeProbes: capture.runtimeProbes } : {}),
        ...(failureClass ? { failureClass } : {})
      },
      ...(failureClass ? { failureClass, confidence: classifyComponentVisualConfidence(failureClass, result, capture.runtimeProbes) } : {}),
      ...(diagnostics.length > 0 ? { diagnostics } : {}),
      ...(evidence.length > 0 ? { evidence } : {}),
      ...(recommendations.length > 0 ? { recommendations } : {}),
      ...(result.status === 'pass'
        ? {}
        : { suggestedNextStep: 'Inspect expected, actual, and diff artifacts. If intentional, update only this component visual baseline.' })
    };
  } catch (error) {
    const summary = `${input.visualCase.id} component visual capture failed: ${error instanceof Error ? error.message : String(error)}`;
    return {
      id: `visual.${input.visualCase.id}`,
      suite: 'visual',
      target,
      status: 'fail',
      severity: blocking ? 'blocking' : 'review',
      summary,
      artifacts: [expectedArtifact],
      failureClass: input.componentSource === 'portal' ? 'adapter-fixture-mismatch' : 'tool-error',
      confidence: 0.9,
      diagnostics: [
        {
          kind: 'component-capture-error',
          severity: 'error',
          message: summary
        }
      ],
      recommendations: ['Fix the component visual runtime setup, then rerun Reflection.'],
      metadata: {
        classification: 'tool-error',
        failureClass: input.componentSource === 'portal' ? 'adapter-fixture-mismatch' : 'tool-error',
        ...createComponentSourceMetadata(input),
        viewport,
        baselinePath: input.visualCase.baseline,
        ...createComponentMetadata(input.visualCase, input.componentSource)
      },
      suggestedNextStep: 'Fix the component visual runtime setup, then rerun Reflection.'
    };
  }
}

async function captureComponentScreenshot(input: {
  browser: Awaited<ReturnType<typeof launchBrowser>>;
  store: ArtifactStore;
  path: string;
  targetUrl: string;
  componentSource: ComponentSource;
  viewport: string;
  viewportSize?: ViewportSize | undefined;
  framing?: EffectiveComponentFraming | undefined;
  browserState?: ComponentBrowserState | undefined;
  probes?: ComponentProbes | undefined;
}) {
  const context = await createBrowserContext(input.browser, input.viewport, input.viewportSize);
  try {
    const page = await context.newPage();
    await page.goto(input.targetUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 2_000 }).catch(() => undefined);
    if (input.componentSource === 'portal') {
      await waitForPortalReady(page);
      if (!input.viewportSize) {
        throw new Error('Portal component visual cases require viewportSize.');
      }
      await assertPortalFrameDimensions(page, input.viewportSize);
    } else if (input.framing) {
      await applyComponentFraming(page, input.framing);
    }
    if (input.browserState) {
      await applyBrowserState(page, input.browserState);
    }
    const runtimeProbes = input.probes ? await collectRuntimeProbes(page, input.probes) : undefined;
    const artifact = await input.store.writeBuffer(input.path, await page.screenshot());
    return { artifact, ...(runtimeProbes ? { runtimeProbes } : {}) };
  } finally {
    await context.close();
  }
}

async function collectRuntimeProbes(page: Page, probes: ComponentProbes): Promise<RuntimeProbeResult> {
  return page.evaluate((input) => {
    function round(value: number): number {
      return Math.round(value * 100) / 100;
    }

    function kebabCase(value: string): string {
      return value.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`);
    }

    function readStyle(styles: CSSStyleDeclaration, property: string): string {
      return styles.getPropertyValue(property) || styles.getPropertyValue(kebabCase(property)) || String(styles.getPropertyValue(property));
    }

    const parts: Record<string, RuntimeProbePartResult> = {};
    for (const [partName, part] of Object.entries(input.parts)) {
      const element = document.querySelector(part.selector) as HTMLElement | null;
      if (!element) {
        parts[partName] = { selector: part.selector, found: false };
        continue;
      }

      const computed = window.getComputedStyle(element);
      const result: RuntimeProbePartResult = {
        selector: part.selector,
        found: true,
        font: {
          fontFamily: computed.fontFamily,
          fontSize: computed.fontSize,
          fontWeight: computed.fontWeight,
          lineHeight: computed.lineHeight,
          letterSpacing: computed.letterSpacing
        }
      };

      if (part.bounds !== false) {
        const bounds = element.getBoundingClientRect();
        result.bounds = {
          x: round(bounds.x),
          y: round(bounds.y),
          width: round(bounds.width),
          height: round(bounds.height)
        };
      }

      if (part.styles && part.styles.length > 0) {
        result.styles = Object.fromEntries(part.styles.map((property) => [property, readStyle(computed, property)]));
      }

      if (part.cssVariables && part.cssVariables.length > 0) {
        result.cssVariables = Object.fromEntries(part.cssVariables.map((property) => [property, computed.getPropertyValue(property).trim()]));
      }

      if (part.text === true) {
        result.text = element.textContent?.trim() ?? '';
      }

      parts[partName] = result;
    }

    return { parts };
  }, probes);
}

async function applyComponentFraming(page: Page, framing: EffectiveComponentFraming): Promise<void> {
  await page.locator(framing.rootSelector).waitFor({ state: 'attached', timeout: 2_000 });

  const background = framing.background ? `background: ${framing.background} !important;` : '';
  const alignment =
    framing.align === 'center'
      ? 'display: grid !important; place-items: center !important;'
      : 'display: block !important;';

  await page.addStyleTag({
    content: `
      html,
      body {
        margin: 0 !important;
        width: 100% !important;
        min-width: 100% !important;
        height: 100% !important;
        min-height: 100% !important;
        overflow: hidden !important;
        ${background}
      }

      ${framing.rootSelector} {
        box-sizing: border-box !important;
        width: 100% !important;
        min-width: 100% !important;
        height: 100% !important;
        min-height: 100% !important;
        margin: 0 !important;
        padding: ${framing.padding}px !important;
        ${background}
        ${alignment}
      }
    `
  });
}

async function waitForPortalReady(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const portalState = globalThis as unknown as { __reflectionPortalReady?: boolean; __reflectionPortalError?: string };
      return portalState.__reflectionPortalReady === true || typeof portalState.__reflectionPortalError === 'string';
    },
    undefined,
    { timeout: 5_000 }
  );

  const portalError = await page.evaluate(() => {
    const portalState = globalThis as unknown as { __reflectionPortalError?: string };
    return portalState.__reflectionPortalError;
  });
  if (portalError) {
    throw new Error(portalError);
  }
}

async function assertPortalFrameDimensions(page: Page, viewportSize: ViewportSize): Promise<void> {
  const frame = await page.locator('#reflection-root').boundingBox({ timeout: 2_000 });
  if (!frame) {
    throw new Error('Reflection portal frame #reflection-root was not found.');
  }

  if (frame.width !== viewportSize.width || frame.height !== viewportSize.height) {
    throw new Error(
      `Reflection portal frame rendered ${frame.width}x${frame.height}, expected ${viewportSize.width}x${viewportSize.height}.`
    );
  }
}

async function applyBrowserState(page: Page, browserState: ComponentBrowserState): Promise<void> {
  if (browserState.animationStabilization.disableAnimations !== false) {
    await page.addStyleTag({ content: '*, *::before, *::after { animation: none !important; transition: none !important; }' });
  }

  if (browserState.kind === 'hover') {
    await page.locator(browserState.selector).hover();
  } else {
    await page.locator(browserState.selector).focus();
  }

  if (browserState.animationStabilization.waitMs && browserState.animationStabilization.waitMs > 0) {
    await page.waitForTimeout(browserState.animationStabilization.waitMs);
  }
}

function createComponentStateMetadata(visualCase: ComponentVisualCase, componentSource: ComponentSource): Record<string, unknown> {
  return {
    statePolicy: visualCase.browserState ? 'browser-forced-with-stabilization' : componentSource === 'portal' ? 'portal-controlled' : 'story-controlled',
    ...(visualCase.stateNote ? { stateNote: visualCase.stateNote } : {}),
    ...(visualCase.browserState ? { browserState: visualCase.browserState } : {})
  };
}

function createComponentMetadata(visualCase: ComponentVisualCase, componentSource: ComponentSource): Record<string, unknown> {
  const framing = resolveComponentFraming(visualCase.framing, componentSource);
  return {
    ...(visualCase.viewportSize ? { viewportSize: visualCase.viewportSize } : {}),
    ...(framing ? { framing } : {}),
    ...createComponentStateMetadata(visualCase, componentSource)
  };
}

function createComponentSourceMetadata(input: { visualCase: ComponentVisualCase; componentSource: ComponentSource; targetUrl: string }): Record<string, unknown> {
  return {
    componentSource: input.componentSource,
    ...(input.visualCase.storyId ? { storyId: input.visualCase.storyId, storyUrl: input.targetUrl } : {}),
    ...(input.visualCase.path ? { path: input.visualCase.path, portalUrl: input.targetUrl } : {})
  };
}

function resolveComponentFraming(framing: ComponentFraming | undefined, componentSource: ComponentSource): EffectiveComponentFraming | undefined {
  if (!framing && componentSource === 'portal') {
    return { rootSelector: '#reflection-root', align: 'center', padding: 0 };
  }

  if (!framing) {
    return undefined;
  }

  return {
    ...framing,
    rootSelector: framing.rootSelector ?? (componentSource === 'portal' ? '#reflection-root' : '#storybook-root')
  };
}

function resolveCaseBaselinePath(visualCase: ComponentVisualCase): string {
  const store = createBaselineStore(visualCase.baselineRoot ? { rootDir: visualCase.baselineRoot } : {});
  return store.resolveBaselinePath(visualCase.baseline);
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function createComponentVisualSummary(id: string, result: { classification: string; diffRatio: number; diffPixels: number; thresholdReason?: string }): string {
  if (result.classification === 'visual-match') {
    return `${id} matches approved component visual baseline.`;
  }

  if (result.classification === 'visual-dimension-mismatch') {
    return `${id} component screenshot dimensions differ from approved baseline.`;
  }

  return `${id} differs from approved component visual baseline by ${(result.diffRatio * 100).toFixed(2)}% (${result.diffPixels} pixels)${
    result.thresholdReason ? `, exceeding ${result.thresholdReason}` : ''
  }.`;
}

function classifyComponentVisualFailure(
  result: {
    classification: string;
    diagnostics?: {
      categories?: string[];
      density?: number;
      changedAreaRatio?: number;
    };
  },
  runtimeProbes: RuntimeProbeResult | undefined
): FailureClass {
  if (result.classification === 'visual-dimension-mismatch') {
    return 'framing-layout-mismatch';
  }

  const categories = result.diagnostics?.categories ?? [];
  if (categories.includes('color-or-token-drift')) {
    return 'token-mismatch';
  }

  if (categories.includes('broad-framing-or-layout')) {
    return 'framing-layout-mismatch';
  }

  if (categories.includes('sparse-text-or-antialiasing')) {
    return 'render-noise';
  }

  if (runtimeProbes && Object.values(runtimeProbes.parts).some((part) => !part.found)) {
    return 'adapter-fixture-mismatch';
  }

  if (categories.includes('localized-change')) {
    return 'runtime-implementation-mismatch';
  }

  return 'unknown';
}

function classifyComponentVisualConfidence(
  failureClass: FailureClass,
  result: {
    classification: string;
    diagnostics?: {
      categories?: string[];
    };
  },
  runtimeProbes: RuntimeProbeResult | undefined
): number {
  if (failureClass === 'framing-layout-mismatch' && result.classification === 'visual-dimension-mismatch') {
    return 0.95;
  }

  if (failureClass === 'adapter-fixture-mismatch' && runtimeProbes && Object.values(runtimeProbes.parts).some((part) => !part.found)) {
    return 0.9;
  }

  if (result.diagnostics?.categories?.length) {
    return 0.75;
  }

  return 0.5;
}

function createComponentVisualEvidence(
  result: {
    expected: unknown;
    actual: unknown;
    diffPixels: number;
    diffRatio: number;
    diagnostics?: unknown;
  },
  runtimeProbes: RuntimeProbeResult | undefined
): DiagnosticEvidence[] {
  return [
    {
      kind: 'visual-diff',
      summary: `${result.diffPixels} changed pixel(s), ratio ${result.diffRatio}`,
      data: {
        expected: result.expected,
        actual: result.actual,
        diagnostics: result.diagnostics ?? null
      }
    },
    ...(runtimeProbes
      ? [
          {
            kind: 'runtime-probes',
            summary: `${Object.keys(runtimeProbes.parts).length} probed part(s)`,
            data: runtimeProbes
          } satisfies DiagnosticEvidence
        ]
      : [])
  ];
}

function createComponentVisualDiagnostics(
  result: {
    classification: string;
    diagnostics?: {
      summary: string;
      likelyCauses: string[];
    };
  },
  runtimeProbes: RuntimeProbeResult | undefined
): CheckDiagnostic[] {
  const diagnostics: CheckDiagnostic[] = [];
  if (result.diagnostics) {
    diagnostics.push({
      kind: result.classification,
      message: result.diagnostics.summary,
      severity: 'warning',
      evidence: result.diagnostics.likelyCauses.map((cause) => ({
        kind: 'likely-cause',
        summary: cause
      }))
    });
  }

  if (runtimeProbes) {
    const missing = Object.entries(runtimeProbes.parts).filter(([, part]) => !part.found);
    if (missing.length > 0) {
      diagnostics.push({
        kind: 'runtime-probe-missing-part',
        message: `Runtime probe selectors did not match: ${missing.map(([name]) => name).join(', ')}.`,
        severity: 'error'
      });
    }
  }

  return diagnostics;
}

function createComponentVisualRecommendations(
  failureClass: FailureClass | undefined,
  result: {
    diagnostics?: {
      likelyCauses: string[];
    };
  }
): string[] {
  if (!failureClass) {
    return [];
  }

  if (result.diagnostics?.likelyCauses.length) {
    return result.diagnostics.likelyCauses;
  }

  if (failureClass === 'adapter-fixture-mismatch') {
    return ['Check the portal fixture, selector wiring, and mounted component state before changing baselines.'];
  }

  if (failureClass === 'framing-layout-mismatch') {
    return ['Check viewportSize, portal frame dimensions, centering, and padding before changing baselines.'];
  }

  return ['Inspect expected, actual, diff, and runtime probe metadata before changing thresholds or baselines.'];
}

function isStorybookCase(visualCase: ComponentVisualCase): visualCase is ComponentVisualCase & { storyId: string } {
  return typeof visualCase.storyId === 'string';
}

function isPortalCase(visualCase: ComponentVisualCase): visualCase is ComponentVisualCase & { path: string; viewportSize: ViewportSize } {
  return typeof visualCase.path === 'string' && visualCase.viewportSize !== undefined;
}
