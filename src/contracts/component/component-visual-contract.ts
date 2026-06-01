import { access, mkdir, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { ArtifactStore } from '../../core/artifact-store.js';
import { createBaselineStore, createMissingBaselineCheck } from '../../core/baseline-store.js';
import type { CheckResult } from '../../core/report-schema.js';
import type { ServerConfig } from '../../core/server-manager.js';
import { createBrowserContext } from '../../integrations/playwright/context-factory.js';
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
  threshold?: VisualThreshold | undefined;
  blocking?: boolean | undefined;
  strict?: boolean | undefined;
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
  const target = `${input.visualCase.storyId} ${viewport}`;
  const baselinePath = resolveCaseBaselinePath(input.visualCase);
  const blocking = input.visualCase.blocking === true || input.visualCase.strict === true;
  const strict = input.visualCase.strict === true || input.visualCase.blocking === true;

  if (!(await pathExists(baselinePath))) {
    return createMissingBaselineCheck({
      id: `visual.${input.visualCase.id}`,
      target,
      baselinePath: input.visualCase.baseline,
      blocking
    });
  }

  const artifactBase = `visual/${input.visualCase.id}`;
  const expectedArtifact = await input.store.writeBuffer(`${artifactBase}/expected.png`, await readFile(baselinePath));
  const actualArtifact = await captureComponentScreenshot({
    browser: input.browser,
    store: input.store,
    path: `${artifactBase}/actual.png`,
    storyUrl: input.storyUrl,
    viewport
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
      baselinePath: input.visualCase.baseline
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
}) {
  const context = await createBrowserContext(input.browser, input.viewport);
  try {
    const page = await context.newPage();
    await page.goto(input.storyUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 2_000 }).catch(() => undefined);
    return input.store.writeBuffer(input.path, await page.screenshot());
  } finally {
    await context.close();
  }
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
