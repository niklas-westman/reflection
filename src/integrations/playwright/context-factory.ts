import type { Browser, BrowserContext } from 'playwright';

export type ViewportName = 'desktop' | 'mobile' | 'tablet' | 'component';

const viewportPresets: Record<ViewportName, { width: number; height: number }> = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844 },
  tablet: { width: 820, height: 1180 },
  component: { width: 390, height: 220 }
};

export function resolveViewport(viewport: string): { width: number; height: number } {
  return viewportPresets[viewport as ViewportName] ?? viewportPresets.desktop;
}

export async function createBrowserContext(browser: Browser, viewport: string): Promise<BrowserContext> {
  return browser.newContext({
    viewport: resolveViewport(viewport),
    deviceScaleFactor: 1,
    locale: 'en-US',
    timezoneId: 'Europe/Stockholm',
    colorScheme: 'light'
  });
}
