import type { Page } from 'playwright';

export async function getHorizontalOverflow(page: Page): Promise<{ hasOverflow: boolean; viewportWidth: number; scrollWidth: number }> {
  return page.evaluate(() => {
    const global = globalThis as unknown as {
      document: {
        documentElement: { scrollWidth: number };
        body?: { scrollWidth: number };
      };
      innerWidth: number;
    };
    const root = global.document.documentElement;
    const body = global.document.body;
    const viewportWidth = global.innerWidth;
    const scrollWidth = Math.max(root.scrollWidth, body?.scrollWidth ?? 0);

    return {
      hasOverflow: scrollWidth > viewportWidth + 1,
      viewportWidth,
      scrollWidth
    };
  });
}
