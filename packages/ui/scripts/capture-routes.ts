// Screenshots of viewer routes at the given widths, in light and dark, for before-and-after review.
// Usage: vite-node scripts/capture-routes.ts <base-url> <out-dir> <name>=<hash-route> [...]
// Widths come from CAPTURE_WIDTHS (default 1400,390). The page is captured in full.
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';

const [baseUrl, outDir, ...routeArgs] = process.argv.slice(2);
if (!baseUrl || !outDir || routeArgs.length === 0) {
  console.error('Usage: capture-routes <base-url> <out-dir> <name>=<hash-route> [...]');
  process.exit(1);
}
const routes = routeArgs.map((arg) => {
  const at = arg.indexOf('=');
  return { name: arg.slice(0, at), route: arg.slice(at + 1) };
});
const widths = (process.env.CAPTURE_WIDTHS ?? '1400,390').split(',').map(Number);

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch();
for (const scheme of ['light', 'dark'] as const) {
  for (const width of widths) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, colorScheme: scheme });
    for (const { name, route } of routes) {
      await page.goto(`${baseUrl}/#${route}`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(800);
      const sideways = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      const file = join(outDir, `${name}-${width}-${scheme}.png`);
      await page.screenshot({ path: file, fullPage: true });
      console.log(`${file}${sideways > 0 ? ` (scrolls sideways by ${sideways}px)` : ''}`);
    }
    await page.close();
  }
}
await browser.close();
