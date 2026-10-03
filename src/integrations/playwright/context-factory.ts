import type { Browser, BrowserContext } from 'playwright';
import { getRouteViewportName, isCustomRouteViewport, type RouteViewport, type ViewportSize } from '../../core/viewport.js';

export type ViewportName = 'desktop' | 'mobile' | 'tablet' | 'component';
export type { ViewportSize };

const viewportPresets: Record<ViewportName, ViewportSize> = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844 },
  tablet: { width: 820, height: 1180 },
  component: { width: 390, height: 220 }
};

export function resolveViewport(viewport: string, viewportSize?: ViewportSize | undefined): ViewportSize {
  if (viewportSize) {
    return viewportSize;
  }

  return viewportPresets[viewport as ViewportName] ?? viewportPresets.desktop;
}

export interface ResolvedRouteViewport {
  name: string;
  size: ViewportSize;
  isCustomSize: boolean;
}

export function resolveRouteViewport(viewport: RouteViewport): ResolvedRouteViewport {
  const name = getRouteViewportName(viewport);
  if (isCustomRouteViewport(viewport)) {
    return { name, size: { width: viewport.width, height: viewport.height }, isCustomSize: true };
  }

  return { name, size: resolveViewport(name), isCustomSize: false };
}

export async function createBrowserContext(browser: Browser, viewport: string, viewportSize?: ViewportSize | undefined): Promise<BrowserContext> {
  return browser.newContext({
    viewport: resolveViewport(viewport, viewportSize),
    deviceScaleFactor: 1,
    locale: 'en-US',
    timezoneId: 'Europe/Stockholm',
    colorScheme: 'light'
  });
}
