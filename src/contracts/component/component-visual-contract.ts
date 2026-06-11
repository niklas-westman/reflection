import { access, mkdir, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { Page } from 'playwright';
import type { ArtifactStore } from '../../core/artifact-store.js';
import { createBaselineStore, createMissingBaselineCheck } from '../../core/baseline-store.js';
import type { CheckResult } from '../../core/report-schema.js';
import type { ServerConfig } from '../../core/server-manager.js';
import { createBrowserContext, type ViewportSize } from '../../integrations/playwright/context-factory.js';
import { launchBrowser } from '../../integrations/playwright/browser-manager.js';
import { startStorybookServer } from '../../integrations/storybook/server.js';
import { resolveStoryUrl } from '../../integrations/storybook/story-url.js';
import { comparePngImages } from '../visual/image-diff.js';
import type { VisualThreshold } from '../visual/thresholds.js';

export type ComponentVisualCase = {
  id: string;
  storyId: string;
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
  rootSelector: string;
  background?: string | undefined;
  align: 'center' | 'start';
  padding: number;
};

export type ComponentVisualContractConfig = {
  enabled?: boolean | undefined;
  storybook: ServerConfig;
  cases: ComponentVisualCase[];
};

export async function runComponentVisualContract(
  config: ComponentVisualContractConfig | undefined,
  store: ArtifactStore
): Promise<CheckResult[]> {
  if (!config || config.enabled === false || config.cases.length === 0) {
    return [];
  }

  const storybook = await startStorybookServer(config.storybook, {
    cwd: process.cwd(),
    logPath: store.resolveRunPath('server/storybook.log')
  });
  const browser = await launchBrowser();

  try {
    const checks: CheckResult[] = [];
    for (const visualCase of config.cases) {
      const storyUrl = resolveStoryUrl(storybook.index, storybook.baseUrl, visualCase.storyId);
      checks.push(await runComponentVisualCase({ visualCase, storyUrl, store, browser }));
    }
    return checks;
  } finally {
    await browser.close();
    await storybook.server.stop();
  }
}

async function runComponentVisualCase(input: {
  visualCase: ComponentVisualCase;
  storyUrl: string;
  store: ArtifactStore;
  browser: Awaited<ReturnType<typeof launchBrowser>>;
}): Promise<CheckResult> {
  const viewport = input.visualCase.viewport ?? 'component';
  const viewportSize = input.visualCase.viewportSize;
  const target = `${input.visualCase.storyId} ${viewport}`;
  const baselinePath = resolveCaseBaselinePath(input.visualCase);
  const blocking = input.visualCase.blocking === true || input.visualCase.strict === true;
  const strict = input.visualCase.strict === true || input.visualCase.blocking === true;

  if (!(await pathExists(baselinePath))) {
    return createMissingBaselineCheck({
      id: `visual.${input.visualCase.id}`,
      target,
      baselinePath: input.visualCase.baseline,
      blocking,
      metadata: createComponentMetadata(input.visualCase)
    });
  }

  const artifactBase = `visual/${input.visualCase.id}`;
  const expectedArtifact = await input.store.writeBuffer(`${artifactBase}/expected.png`, await readFile(baselinePath));
  const actualArtifact = await captureComponentScreenshot({
    browser: input.browser,
    store: input.store,
    path: `${artifactBase}/actual.png`,
    storyUrl: input.storyUrl,
    viewport,
    viewportSize,
    framing: input.visualCase.framing,
    browserState: input.visualCase.browserState
  });
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

  return {
    id: `visual.${input.visualCase.id}`,
    suite: 'visual',
    target,
    status: result.status,
    severity,
    summary: createComponentVisualSummary(input.visualCase.id, result),
    artifacts: [expectedArtifact, actualArtifact, ...(diffArtifact ? [diffArtifact] : [])],
    metadata: {
      ...result,
      storyId: input.visualCase.storyId,
      storyUrl: input.storyUrl,
      viewport,
      baselinePath: input.visualCase.baseline,
      ...createComponentMetadata(input.visualCase)
    },
    ...(result.status === 'pass'
      ? {}
      : { suggestedNextStep: 'Inspect expected, actual, and diff artifacts. If intentional, update only this component visual baseline.' })
  };
}

async function captureComponentScreenshot(input: {
  browser: Awaited<ReturnType<typeof launchBrowser>>;
  store: ArtifactStore;
  path: string;
  storyUrl: string;
  viewport: string;
  viewportSize?: ViewportSize | undefined;
  framing?: ComponentFraming | undefined;
  browserState?: ComponentBrowserState | undefined;
}) {
  const context = await createBrowserContext(input.browser, input.viewport, input.viewportSize);
  try {
    const page = await context.newPage();
    await page.goto(input.storyUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 2_000 }).catch(() => undefined);
    if (input.framing) {
      await applyComponentFraming(page, input.framing);
    }
    if (input.browserState) {
      await applyBrowserState(page, input.browserState);
    }
    return input.store.writeBuffer(input.path, await page.screenshot());
  } finally {
    await context.close();
  }
}

async function applyComponentFraming(page: Page, framing: ComponentFraming): Promise<void> {
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

function createComponentStateMetadata(visualCase: ComponentVisualCase): Record<string, unknown> {
  return {
    statePolicy: visualCase.browserState ? 'browser-forced-with-stabilization' : 'story-controlled',
    ...(visualCase.stateNote ? { stateNote: visualCase.stateNote } : {}),
    ...(visualCase.browserState ? { browserState: visualCase.browserState } : {})
  };
}

function createComponentMetadata(visualCase: ComponentVisualCase): Record<string, unknown> {
  return {
    ...(visualCase.viewportSize ? { viewportSize: visualCase.viewportSize } : {}),
    ...(visualCase.framing ? { framing: visualCase.framing } : {}),
    ...createComponentStateMetadata(visualCase)
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
