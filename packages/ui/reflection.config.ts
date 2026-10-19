import { defineReflection } from '../../src/core/define-reflection';

// Reflection run on its own viewer: every route is opened against the demo bundles in two desktop widths and a
// phone width, and must render its heading, stay free of console errors and of sideways page scroll.
// Commands run from the repository root, so they name the package. Run it with: pnpm --filter reflection-ui reflect
const port = 5174;
const baseUrl = `http://127.0.0.1:${port}`;
const viewports = ['desktop', { name: 'desktop-narrow', width: 1100, height: 800 }, { name: 'phone', width: 390, height: 844 }];
const quiet = [{ noConsoleErrors: true }, { noHorizontalOverflow: true }, { screenshot: 'final' }] as const;

// Baselines are made on one platform, and font rendering differs between platforms, so the file name says which.
// A run on another platform finds no baseline and reports a review item instead of a false difference.
const platform = 'chromium-darwin';
const baselineRoot = 'packages/ui/tests/visual-baselines';
const baselined: Array<[route: string, viewport: string]> = [
  ['releases', 'desktop'],
  ['overview', 'desktop'],
  ['overview', 'desktop-narrow'],
  ['page-checks', 'desktop'],
  ['inventory', 'desktop'],
  ['component-gallery', 'desktop'],
  ['component-gallery', 'desktop-narrow'],
  ['comparison', 'desktop'],
  ['comparison', 'desktop-narrow'],
  ['changes', 'desktop'],
  ['design-references', 'desktop'],
  ['summary-only', 'desktop'],
  ['invalid-evidence', 'desktop'],
  ['rejected-bundle', 'desktop']
];

const lightRoutes = [
  { id: 'releases', name: 'All releases', path: '/#/', viewports, expects: [{ role: 'heading', name: 'Bundles' }, { text: 'Earlier releases (summary only)' }, ...quiet] },
  { id: 'overview', name: 'Release overview', path: '/#/bundles/docs-site', viewports, expects: [{ role: 'heading', name: 'Release status' }, { text: 'Needs attention' }, ...quiet] },
  { id: 'page-checks', name: 'Page overview', path: '/#/bundles/docs-site/pages/pricing', viewports, expects: [{ role: 'heading', name: 'Pricing page' }, { text: 'Recorded page checks' }, ...quiet] },
  { id: 'inventory', name: 'All required items', path: '/#/bundles/docs-site/pages/pricing?view=items', viewports, expects: [{ role: 'heading', name: 'Pricing page' }, { text: 'Not proven' }, ...quiet] },
  { id: 'component-gallery', name: 'Component gallery', path: '/#/bundles/marwes-button/components/button', viewports, expects: [{ role: 'heading', name: 'button' }, { text: 'Verification details' }, { text: 'Visual comparison' }, ...quiet] },
  {
    id: 'comparison',
    name: 'Comparison inspector',
    path: '/#/bundles/docs-site/pages/pricing/comparisons/docs-site%2Fpricing%2Fhero.phone%2Fchrome',
    viewports,
    expects: [{ role: 'heading', name: 'hero.phone · chrome' }, { text: 'Verification result' }, { text: 'Measurements' }, ...quiet]
  },
  { id: 'changes', name: 'Changes since the previous release', path: '/#/bundles/docs-site/changes', viewports, expects: [{ role: 'heading', name: 'Changes in demo' }, { text: 'Changes to inspect' }, ...quiet] },
  { id: 'design-references', name: 'Design references', path: '/#/bundles/docs-site/design-references', viewports, expects: [{ role: 'heading', name: 'Design references' }, { text: 'Reference approvals' }, ...quiet] },
  { id: 'summary-only', name: 'A release that is only a summary', path: '/#/archive/docs-site/demo-older', viewports, expects: [{ text: 'Historical release: its evidence was removed' }, { text: 'Decision' }, ...quiet] },
  { id: 'invalid-evidence', name: 'A bundle with an image that does not match its hash', path: '/#/bundles/docs-site-tampered-image/pages/pricing', viewports, expects: [{ text: 'Some evidence in this bundle is unusable' }, ...quiet] },
  { id: 'rejected-bundle', name: 'A bundle that cannot be trusted', path: '/#/bundles/docs-site-rejected', viewports, expects: [{ text: 'This bundle is invalid and cannot be shown' }, ...quiet] },
  { id: 'presented-page', name: 'A page of 200 items laid out by its provider', path: '/#/bundles/checkout-200/pages/checkout', viewports, expects: [{ role: 'heading', name: 'Checkout' }, { text: 'laid out as the provider describes them' }, ...quiet] },
  { id: 'all-failing', name: 'A release where every check fails', path: '/#/bundles/signup-all-failing', viewports, expects: [{ role: 'heading', name: 'Release status' }, { text: 'Needs attention' }, ...quiet] }
];

// The same routes in the dark theme. They have no baselines yet: they must render, log no error and not scroll
// sideways, and they are checked for contrast by `pnpm a11y`.
const darkRoutes = lightRoutes.map((route) => ({ ...route, id: `${route.id}-dark`, name: `${route.name} (dark)`, setup: { colorScheme: 'dark' as const } }));

export default defineReflection({
  project: 'reflection-ui',
  run: { defaultMode: 'smoke', ciMode: 'smoke' },
  // The demo bundles are generated, git-ignored data: rebuild them so the run never depends on stale files.
  lifecycle: { beforeRun: [{ id: 'demo-bundles', command: 'pnpm --dir packages/ui demo-bundles', cwd: '.', timeoutMs: 120_000, blocking: true }] },
  contracts: {
    browser: {
      enabled: true,
      blocking: true,
      baseUrl,
      server: {
        command: `pnpm --dir packages/ui dev --host 127.0.0.1 --port ${port} --strictPort`,
        readyUrl: baseUrl,
        reuseExisting: true,
        timeoutMs: 60_000
      },
      stability: { waitFor: ['fonts', 'images'], settleMs: 400 },
      routes: [...lightRoutes, ...darkRoutes],
      // Review-only: a difference is shown for a person to judge, and never blocks a run. The viewer is mostly empty space, so a ratio would let a real change through; 50 pixels is slack for anti-aliasing (the measured noise on one machine is 0).
      visualSmoke: baselined.map(([route, viewport]) => ({
        id: `${route}-${viewport}`,
        route,
        viewport,
        baselineRoot,
        baseline: `${route}/${viewport}.${platform}.light.webp`,
        threshold: { maxDiffPixels: 50 }
      }))
    }
  }
});
