import { createHash } from 'node:crypto';
import type { BrowserContext, Page } from 'playwright';
import { redactUrl } from '../../core/redact-url.js';
import type { Box, PartRuntime, PlatformFont } from './record.js';

export interface FontResponseObservation {
  url: string;
  status: number;
  bytes: number | null;
  sha256: string | null;
}

export interface PageObservation {
  url: string;
  viewport: { width: number; height: number };
  devicePixelRatio: number;
  fontsStatus: string;
  fontFaces: Array<{ family: string; weight: string; style: string; stretch: string; status: string }>;
  fontResponses: FontResponseObservation[];
}

export interface FontResponseCollector {
  attach(page: Page): void;
  results(): Promise<FontResponseObservation[]>;
}

export function createFontResponseCollector(): FontResponseCollector {
  const pending: Array<Promise<FontResponseObservation>> = [];
  return {
    attach(page) {
      page.on('response', (response) => {
        if (response.request().resourceType() !== 'font') {
          return;
        }
        pending.push(
          response
            .body()
            .then((body) => ({ url: redactUrl(response.url()), status: response.status(), bytes: body.length, sha256: createHash('sha256').update(body).digest('hex') }))
            .catch(() => ({ url: redactUrl(response.url()), status: response.status(), bytes: null, sha256: null }))
        );
      });
    },
    results: () => Promise.all(pending)
  };
}

export interface ObservePartsInput {
  page: Page;
  context: BrowserContext;
  parts: Array<{ id: string; selector: string }>;
  fontResponses: FontResponseCollector;
}

export async function observePage(input: ObservePartsInput): Promise<{ page: PageObservation; parts: Map<string, PartRuntime> }> {
  const pageObservation = await input.page.evaluate(async () => {
    await document.fonts.ready;
    const fontFaces: Array<{ family: string; weight: string; style: string; stretch: string; status: string }> = [];
    document.fonts.forEach((face) => {
      fontFaces.push({ family: face.family, weight: face.weight, style: face.style, stretch: face.stretch, status: face.status });
    });
    return {
      url: window.location.href,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      devicePixelRatio: window.devicePixelRatio,
      fontsStatus: document.fonts.status,
      fontFaces
    };
  });

  const parts = new Map<string, PartRuntime>();
  for (const part of input.parts) {
    parts.set(part.id, await observePart(input, part));
  }

  return {
    page: { ...pageObservation, url: redactUrl(pageObservation.url), fontResponses: await input.fontResponses.results() },
    parts
  };
}

async function observePart(input: ObservePartsInput, part: { id: string; selector: string }): Promise<PartRuntime> {
  const locator = input.page.locator(part.selector);
  const matchCount = await locator.count();
  if (matchCount !== 1) {
    return emptyRuntime(part.selector, matchCount);
  }

  // No named inner functions here: bundlers that keep function names would inject helpers that do not exist inside the page.
  const dom = await input.page.evaluate((selector) => {
    const element = document.querySelector(selector) as HTMLElement;
    const computed = window.getComputedStyle(element);
    const elementRect = element.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(element);
    const textRect = range.getBoundingClientRect();

    // The probe is removed immediately; this page is a separate diagnostic session, never the one that was screenshotted.
    const probe = document.createElement('span');
    probe.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline;';
    element.appendChild(probe);
    const baselineY = probe.getBoundingClientRect().bottom;
    probe.remove();

    const transforms: Array<{ element: string; matrix: string }> = [];
    for (let current: HTMLElement | null = element; current && transforms.length < 16; current = current.parentElement) {
      const transform = window.getComputedStyle(current).transform;
      if (transform && transform !== 'none') {
        transforms.push({ element: current.tagName.toLowerCase(), matrix: transform });
      }
    }

    return {
      actualText: element.textContent ?? '',
      element: {
        tagName: element.tagName.toLowerCase(),
        role: element.getAttribute('role'),
        ariaLabel: element.getAttribute('aria-label')
      },
      computed: {
        fontFamily: computed.fontFamily,
        fontSize: computed.fontSize,
        fontWeight: computed.fontWeight,
        fontStyle: computed.fontStyle,
        fontStretch: computed.fontStretch,
        fontVariationSettings: computed.fontVariationSettings,
        fontFeatureSettings: computed.fontFeatureSettings,
        fontKerning: computed.fontKerning,
        letterSpacing: computed.letterSpacing,
        lineHeight: computed.lineHeight,
        direction: computed.direction,
        textTransform: computed.textTransform,
        color: computed.color
      },
      elementBounds: { x: elementRect.x, y: elementRect.y, width: elementRect.width, height: elementRect.height },
      textBounds: textRect.width > 0 || textRect.height > 0 ? { x: textRect.x, y: textRect.y, width: textRect.width, height: textRect.height } : null,
      baselineY,
      transforms
    };
  }, part.selector);

  const platformFonts = await readPlatformFonts(input, part.selector);
  const ariaSnapshot = await locator.ariaSnapshot({ timeout: 2_000 }).catch(() => null);

  return {
    selector: part.selector,
    matchCount,
    actualText: dom.actualText,
    element: { ...dom.element, ariaSnapshot },
    typography: {
      ...dom.computed,
      fontSize: parsePx(dom.computed.fontSize),
      fontWeight: Number.parseFloat(dom.computed.fontWeight),
      letterSpacingPx: dom.computed.letterSpacing === 'normal' ? 0 : parsePx(dom.computed.letterSpacing),
      lineHeightPx: parsePx(dom.computed.lineHeight)
    },
    geometry: {
      elementBounds: dom.elementBounds,
      textBounds: dom.textBounds,
      baseline: Number.isFinite(dom.baselineY) ? { y: dom.baselineY, method: 'inline-block-probe', basis: 'observed' } : null,
      transforms: dom.transforms
    },
    platformFonts,
    platformFontsMethod: platformFonts ? 'CSS.getPlatformFontsForNode' : 'unavailable'
  };
}

function parsePx(value: string): number | null {
  if (value === 'normal') {
    return null;
  }
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function readPlatformFonts(input: ObservePartsInput, selector: string): Promise<PlatformFont[] | null> {
  // document.fonts.check() and the requested family string do not prove which font painted the glyphs; the browser's own record does.
  const session = await input.context.newCDPSession(input.page).catch(() => undefined);
  if (!session) {
    return null;
  }

  try {
    await session.send('DOM.enable');
    await session.send('CSS.enable');
    const { root } = await session.send('DOM.getDocument', { depth: 0 });
    const { nodeId } = await session.send('DOM.querySelector', { nodeId: root.nodeId, selector });
    if (!nodeId) {
      return null;
    }
    const { fonts } = await session.send('CSS.getPlatformFontsForNode', { nodeId });
    return fonts.map((font) => ({
      familyName: font.familyName,
      postScriptName: font.postScriptName ?? null,
      isCustomFont: font.isCustomFont,
      glyphCount: font.glyphCount
    }));
  } catch {
    return null;
  } finally {
    await session.detach().catch(() => undefined);
  }
}

function emptyRuntime(selector: string, matchCount: number): PartRuntime {
  return {
    selector,
    matchCount,
    actualText: null,
    element: null,
    typography: null,
    geometry: null,
    platformFonts: null,
    platformFontsMethod: 'unavailable'
  };
}

export type { Box };
