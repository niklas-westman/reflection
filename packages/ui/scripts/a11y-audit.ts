// Audits every viewer route, light and dark, for accessibility: axe-core's WCAG A and AA rules (contrast, names,
// roles, labels) and a keyboard walk that checks each focusable element has a name and a visible focus style.
// Run it from this package after the demo bundles exist: pnpm demo-bundles && pnpm a11y
import { spawn, type ChildProcess } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';
import config from '../reflection.config';

const port = 5175;
const baseUrl = `http://127.0.0.1:${port}`;
const require = createRequire(import.meta.url);
const axeSource = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
// The dark variants are the same routes; this script visits each in both themes itself.
const routes = (config.contracts.browser?.routes ?? []).filter((route) => !route.id.endsWith('-dark')).map((route) => ({ id: route.id, path: route.path }));
const schemes = ['light', 'dark'] as const;

interface Finding {
  route: string;
  scheme: string;
  kind: 'axe' | 'keyboard';
  message: string;
}

async function startServer(): Promise<ChildProcess> {
  const server = spawn('pnpm', ['exec', 'vite', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { stdio: 'ignore' });
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const ready = await fetch(baseUrl).then((response) => response.ok, () => false);
    if (ready) return server;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  server.kill();
  throw new Error('The Vite server did not start.');
}

const server = await startServer();
const findings: Finding[] = [];
try {
  const browser = await chromium.launch();
  for (const scheme of schemes) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: scheme });
    const page = await context.newPage();
    const audit = async (id: string): Promise<void> => {
      await page.evaluate(axeSource);
      const result = await page.evaluate(async () => {
        // @ts-expect-error axe is injected into the page above
        return (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } })).violations.map((violation: { id: string; impact: string; help: string; nodes: Array<{ target: string[] }> }) => ({
          id: violation.id,
          impact: violation.impact,
          help: violation.help,
          count: violation.nodes.length,
          first: violation.nodes[0]?.target.join(' ')
        }));
      });
      for (const violation of result) {
        findings.push({ route: id, scheme, kind: 'axe', message: `${violation.impact} ${violation.id}: ${violation.help} (${violation.count}), e.g. ${violation.first}` });
      }
    };

    for (const route of routes) {
      await page.goto(baseUrl + route.path);
      await page.waitForTimeout(1500);
      await audit(route.id);

      const title = await page.title();
      if (!title || title === 'Reflection') findings.push({ route: route.id, scheme, kind: 'keyboard', message: 'the page has no title of its own' });

      // Keyboard walk: every stop needs a name and a focus indicator.
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      const seen = new Set<string>();
      for (let step = 0; step < 60; step += 1) {
        await page.keyboard.press('Tab');
        const stop = await page.evaluate(() => {
          const element = document.activeElement as HTMLElement | null;
          if (!element || element === document.body) return undefined;
          const style = getComputedStyle(element);
          const name = (element.getAttribute('aria-label') ?? element.getAttribute('aria-labelledby') ?? element.textContent ?? (element as HTMLInputElement).placeholder ?? '').trim();
          const labelled = ((element as HTMLInputElement).labels?.length ?? 0) > 0;
          const outline = style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0;
          const shadow = style.boxShadow !== 'none';
          const rect = element.getBoundingClientRect();
          return { id: `${element.tagName}:${name.slice(0, 40)}:${Math.round(rect.x)}:${Math.round(rect.y)}`, tag: element.tagName, name: name || (labelled ? '(label)' : ''), visibleFocus: outline || shadow, size: rect.width * rect.height };
        });
        if (!stop) continue;
        if (seen.has(stop.id)) break;
        seen.add(stop.id);
        if (!stop.name) findings.push({ route: route.id, scheme, kind: 'keyboard', message: `${stop.tag} takes focus but has no accessible name` });
        if (!stop.visibleFocus) findings.push({ route: route.id, scheme, kind: 'keyboard', message: `${stop.tag} "${stop.name.slice(0, 30)}" takes focus with no visible focus style` });
      }
    }

    // States that only exist after an action: open menus and the comparison modes.
    const scenarios: Array<{ id: string; route: string; steps: () => Promise<void> }> = [
      { id: 'inventory with the filter menu open', route: 'inventory', steps: async () => void (await page.getByRole('button', { name: 'Filter' }).click()) },
      { id: 'gallery with the implementations menu open', route: 'component-gallery', steps: async () => void (await page.getByText(/Show implementations/).click()) },
      { id: 'inspector in overlay mode', route: 'comparison', steps: async () => void (await page.getByRole('button', { name: 'Overlay' }).click()) },
      { id: 'inspector in wipe mode', route: 'comparison', steps: async () => void (await page.getByRole('button', { name: 'Wipe' }).click()) },
      { id: 'inspector in diff mode with the checkerboard', route: 'comparison', steps: async () => { await page.getByRole('button', { name: 'Diff', exact: true }).click(); await page.getByRole('button', { name: 'Checkerboard' }).click(); } },
      { id: 'inspector with the difference large', route: 'comparison', steps: async () => void (await page.getByRole('button', { name: 'Difference large' }).click()) },
      { id: 'inspector with provenance open and the navigation shown', route: 'comparison', steps: async () => { await page.getByText('Provenance', { exact: true }).click(); await page.getByRole('button', { name: 'Navigation' }).click(); } }
    ];
    for (const scenario of scenarios) {
      const route = routes.find((entry) => entry.id === scenario.route);
      if (!route) continue;
      await page.goto(baseUrl + route.path);
      await page.waitForTimeout(1500);
      await scenario.steps();
      await page.waitForTimeout(600);
      await audit(scenario.id);
    }
    await context.close();
  }
  await browser.close();
} finally {
  server.kill();
}

const unique = new Map<string, { count: number; finding: Finding }>();
for (const finding of findings) {
  const key = `${finding.kind}|${finding.message}`;
  unique.set(key, { count: (unique.get(key)?.count ?? 0) + 1, finding: unique.get(key)?.finding ?? finding });
}
if (unique.size === 0) {
  console.log(`No accessibility findings across ${routes.length} routes in ${schemes.join(' and ')}.`);
} else {
  for (const { count, finding } of unique.values()) {
    console.log(`[${finding.kind}] ${finding.message}\n   first seen on ${finding.route} (${finding.scheme}); ${count} route/scheme combination${count === 1 ? '' : 's'}`);
  }
  console.log(`\n${unique.size} distinct finding${unique.size === 1 ? '' : 's'}.`);
  process.exitCode = 1;
}
