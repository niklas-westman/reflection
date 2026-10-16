import { createHash } from 'node:crypto';
import type { Browser, BrowserContext, Page } from 'playwright';
import type { ArtifactStore } from '../../core/artifact-store.js';
import type { RgbaImage } from '../../contracts/visual/image-io.js';
import { decodeImageBytes } from '../../contracts/visual/image-io.js';
import type { LoadedOutline } from './bundle-loader.js';
import type { FontResponseCollector } from './runtime-observation.js';
import type { Box, ExperimentMeasurement, ExperimentRecord, RecordArtifact } from './record.js';
import { measureDifference } from './region-measure.js';

export interface CaseSession {
  page: Page;
  context: BrowserContext;
  fontResponses: FontResponseCollector;
  close(): Promise<void>;
}

export interface ExperimentContext {
  browser: Browser;
  openCaseSession: () => Promise<CaseSession>;
  store: ArtifactStore;
  artifactBase: string;
  reference: RgbaImage;
  actual: RgbaImage;
  deviceScaleFactor: number;
  viewport: { width: number; height: number };
}

export interface ExperimentResult {
  record: ExperimentRecord;
  artifacts: RecordArtifact[];
}

function dataUrl(outline: LoadedOutline): string {
  return `data:image/svg+xml;base64,${outline.bytes.toString('base64')}`;
}

export async function runFrameRenderExperiment(context: ExperimentContext, frame: LoadedOutline, regions: Box[]): Promise<ExperimentResult> {
  const base: ExperimentRecord = {
    id: 'frame-render',
    kind: 'frame-render',
    state: 'error',
    description: 'The complete outlined source frame is rendered passively in an isolated browser context and compared with the original reference image.'
  };

  // JavaScript is off and every request is aborted: the SVG is only ever shown as an image.
  const isolated = await context.browser.newContext({
    viewport: context.viewport,
    deviceScaleFactor: context.deviceScaleFactor,
    javaScriptEnabled: false,
    serviceWorkers: 'block',
    acceptDownloads: false
  });
  try {
    await isolated.route('**/*', (route) => route.abort());
    const page = await isolated.newPage();
    await page.setContent(
      `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:#fff}img{display:block}</style><img alt="" width="${frame.artifact.bounds.width}" height="${frame.artifact.bounds.height}" src="${dataUrl(frame)}">`,
      { waitUntil: 'load' }
    );
    return await finishExperiment(context, base, await page.screenshot({ type: 'png' }), 'frame-render', regions);
  } catch (error) {
    return failed(base, error);
  } finally {
    await isolated.close().catch(() => undefined);
  }
}

export async function runPartOverlayExperiment(context: ExperimentContext, outline: LoadedOutline, partId: string, selector: string, regions: Box[]): Promise<ExperimentResult> {
  const base: ExperimentRecord = {
    id: `part-overlay:${partId}`,
    kind: 'part-overlay',
    partId,
    state: 'error',
    description:
      'In a separate session on the same component state, the native text is made transparent and the outlined source is placed at its source coordinates. The real screenshot is never touched.'
  };

  let session: CaseSession | undefined;
  try {
    session = await context.openCaseSession();
    const outcome = await session.page.evaluate(overlayOutline, {
      selector,
      url: dataUrl(outline),
      bounds: outline.artifact.bounds,
      viewport: context.viewport
    });
    if (outcome !== 'ok') {
      return { record: { ...base, state: 'skipped', reason: outcome }, artifacts: [] };
    }

    return await finishExperiment(context, base, await session.page.screenshot({ type: 'png' }), `${partId}-overlay`, regions);
  } catch (error) {
    return failed(base, error);
  } finally {
    await session?.close().catch(() => undefined);
  }
}

// Fractional x/y/width/height go straight onto an SVG <image>, avoiding CSS layout's 1/64px snapping of positioned boxes.
async function overlayOutline(input: { selector: string; url: string; bounds: Box; viewport: { width: number; height: number } }): Promise<string> {
  const element = document.querySelector(input.selector);
  if (!element) {
    return 'selector-not-found';
  }

  const style = document.createElement('style');
  style.textContent = `${input.selector}, ${input.selector} * { color: transparent !important; -webkit-text-fill-color: transparent !important; text-shadow: none !important; }`;
  document.head.appendChild(style);

  const namespace = 'http://www.w3.org/2000/svg';
  const overlay = document.createElementNS(namespace, 'svg');
  overlay.setAttribute('width', String(input.viewport.width));
  overlay.setAttribute('height', String(input.viewport.height));
  overlay.setAttribute('style', 'position:fixed;left:0;top:0;pointer-events:none;z-index:2147483647;');
  const image = document.createElementNS(namespace, 'image');
  image.setAttribute('x', String(input.bounds.x));
  image.setAttribute('y', String(input.bounds.y));
  image.setAttribute('width', String(input.bounds.width));
  image.setAttribute('height', String(input.bounds.height));
  image.setAttribute('href', input.url);
  overlay.appendChild(image);

  const loaded = new Promise<string>((resolve) => {
    image.addEventListener('load', () => resolve('ok'));
    image.addEventListener('error', () => resolve('outline-image-failed-to-load'));
  });
  document.body.appendChild(overlay);
  const outcome = await loaded;
  await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  return outcome;
}

async function finishExperiment(context: ExperimentContext, base: ExperimentRecord, png: Buffer, name: string, regions: Box[]): Promise<ExperimentResult> {
  const { image: render } = await decodeImageBytes(png, name);
  const region = unionRegion(regions);
  const measured = measureDifference(context.reference, render, region, context.deviceScaleFactor);
  if (!measured) {
    return {
      record: { ...base, state: 'error', reason: `The diagnostic render is ${render.width}x${render.height}, not the reference size ${context.reference.width}x${context.reference.height}.` },
      artifacts: []
    };
  }

  const nativeMeasured = measureDifference(context.reference, context.actual, region, context.deviceScaleFactor);
  const renderArtifact = await writeArtifact(context, `${name}.png`, png, 'diagnostic-render', 'image/png');
  const diffArtifact = await writeArtifact(context, `${name}-comparison.png`, measured.diffPng, 'comparison-image', 'image/png', 'Diagnostic render against the original reference.');
  return {
    record: {
      ...base,
      state: 'available',
      render: summarize(renderArtifact),
      diff: summarize(diffArtifact),
      measurement: measured.measurement,
      ...(nativeMeasured ? { nativeMeasurement: nativeMeasured.measurement } : {})
    },
    artifacts: [renderArtifact, diffArtifact]
  };
}

async function writeArtifact(context: ExperimentContext, name: string, bytes: Buffer, role: RecordArtifact['role'], mediaType: string, note?: string): Promise<RecordArtifact> {
  const path = `${context.artifactBase}/text-diagnostics/${name}`;
  await context.store.writeBuffer(path, bytes);
  return { role, path, sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length, mediaType, ...(note ? { note } : {}) };
}

function summarize(artifact: RecordArtifact): { path: string; sha256: string; bytes: number } {
  return { path: artifact.path, sha256: artifact.sha256, bytes: artifact.bytes };
}

function failed(base: ExperimentRecord, error: unknown): ExperimentResult {
  return { record: { ...base, state: 'error', reason: error instanceof Error ? error.message : String(error) }, artifacts: [] };
}

function unionRegion(regions: Box[]): Box {
  const left = Math.min(...regions.map((region) => region.x));
  const top = Math.min(...regions.map((region) => region.y));
  const right = Math.max(...regions.map((region) => region.x + region.width));
  const bottom = Math.max(...regions.map((region) => region.y + region.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

export type { ExperimentMeasurement };
