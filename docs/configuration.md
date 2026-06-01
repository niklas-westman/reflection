# Reflection configuration

Reflection reads a project config from the path passed to `reflection run --config <path>`. Use `reflection.config.ts` as the conventional root filename. The config is validated before runners execute, so malformed contracts fail as setup errors instead of producing ambiguous reports.

The loader supports TypeScript config files (`.ts`, `.mts`, `.cts`) through `jiti` and JavaScript ESM config files through dynamic import.

## Minimal shape

```ts
import { defineReflection } from 'reflection';

export default defineReflection({
  project: 'my-app',
  contracts: {
    browser: {
      baseUrl: 'http://127.0.0.1:5173',
      routes: []
    }
  }
});
```

During Reflection repository development, examples import `defineReflection` from source instead:

```ts
import { defineReflection } from '../../src/core/define-reflection';
```

## Top-level fields

| Field | Required | Notes |
| --- | --- | --- |
| `project` | yes | Stable project name written into reports. |
| `contracts.browser` | no | Browser route and route-level visual smoke checks. |
| `contracts.design` | no | Project-owned command checks. |
| `contracts.component` | no | Storybook-backed component visual checks. |

Run mode is currently selected by the CLI with `reflection run --mode <mode>` and defaults to `smoke` when omitted. The `--ci` flag changes CI/report-root behavior but does not select a separate config-defined run mode yet.

## Run modes

| Mode | Runs |
| --- | --- |
| `smoke` | Browser route checks and route-level visual smoke cases. |
| `design` | Design command checks. |
| `visual` | Storybook component visual checks. |
| `full` | Browser, design, and component contracts. |

## Browser contract

```ts
browser: {
  enabled: true,
  blocking: true,
  baseUrl: 'http://127.0.0.1:5173',
  server: {
    command: 'pnpm dev --host 127.0.0.1',
    readyUrl: 'http://127.0.0.1:5173',
    reuseExisting: true,
    timeoutMs: 60_000
  },
  maskSelectors: ['[data-reflection-mask]'],
  routes: [
    {
      id: 'home',
      name: 'Home route',
      path: '/',
      viewports: ['desktop', 'mobile'],
      expects: [
        { role: 'heading', name: 'Home' },
        { noHorizontalOverflow: true },
        { noConsoleErrors: true },
        { screenshot: 'final' }
      ]
    }
  ],
  visualSmoke: [
    {
      id: 'home-mobile',
      route: 'home',
      viewport: 'mobile',
      baselineRoot: 'tests/fixtures/baselines',
      baseline: 'browser/home/mobile.chromium-linux.light.png',
      threshold: { maxDiffPixelRatio: 0.01 },
      strict: false
    }
  ]
}
```

Browser fields:

| Field | Notes |
| --- | --- |
| `enabled` | Defaults to `true`; set `false` to skip. |
| `blocking` | Defaults to `true`; route assertion failures are blocking unless configured otherwise by current runner behavior. |
| `baseUrl` | Absolute URL used to visit route paths. |
| `server` | Optional managed server. If omitted, Reflection assumes `baseUrl` is already reachable. |
| `maskSelectors` | Selectors masked in browser screenshots. |
| `routes` | Route assertions executed in `smoke` and `full` modes. |
| `visualSmoke` | Route screenshot baseline comparisons driven from successful browser screenshots. |

Supported browser expectations:

```ts
{ urlIncludes: '/dashboard' }
{ urlEquals: 'http://127.0.0.1:5173/dashboard' }
{ role: 'heading', name: 'Dashboard' }
{ label: 'Email' }
{ text: 'Welcome back' }
{ noText: 'Stack trace' }
{ selector: '[data-ready="true"]' }
{ elementVisible: '[data-toast]' }
{ elementNotVisible: '[data-loading]' }
{ noHorizontalOverflow: true }
{ noConsoleErrors: true }
{ screenshot: 'final' }
```

## Route-level visual smoke cases

Route visual smoke cases compare the screenshot captured by a browser route check against a read-only baseline.

```ts
visualSmoke: [
  {
    id: 'login-mobile',
    route: 'login',
    viewport: 'mobile',
    baselineRoot: 'tests/fixtures/baselines',
    baseline: 'browser/login/mobile.chromium-linux.light.png',
    threshold: {
      maxDiffPixels: 25,
      maxDiffPixelRatio: 0.01
    },
    blocking: false,
    strict: false
  }
]
```

`blocking: true` or `strict: true` promotes a visual diff to a blocking failure. By default, visual diffs and missing baselines are review-only. The current `reflection update` command promotes route-level `visualSmoke` baselines only; component visual baselines should be copied or reviewed manually until component update support lands.

## Design command contract

```ts
design: {
  enabled: true,
  commands: [
    {
      id: 'tokens',
      command: 'pnpm design:check',
      cwd: '.',
      blocking: true
    }
  ]
}
```

Each design command runs as a project-owned process and writes stdout/stderr evidence into the run artifacts. Use this for token checks, lint-like design-system checks, or other deterministic commands that should participate in the same report.

## Component visual contract

```ts
component: {
  enabled: true,
  storybook: {
    command: 'pnpm storybook --host 127.0.0.1 --port 6006',
    readyUrl: 'http://127.0.0.1:6006',
    reuseExisting: true,
    timeoutMs: 60_000
  },
  cases: [
    {
      id: 'primary-button',
      storyId: 'atoms-button--primary',
      viewport: 'component',
      baselineRoot: 'tests/fixtures/baselines',
      baseline: 'components/button/primary.chromium-linux.light.png',
      threshold: { maxDiffPixelRatio: 0.005 },
      stateNote: 'Preferred: story-controlled primary state.'
    },
    {
      id: 'primary-button-hover',
      storyId: 'atoms-button--primary',
      baselineRoot: 'tests/fixtures/baselines',
      baseline: 'components/button/primary-hover.chromium-linux.light.png',
      browserState: {
        kind: 'hover',
        selector: 'button',
        animationStabilization: { disableAnimations: true }
      }
    }
  ]
}
```

Component visual cases resolve Storybook `/index.json`, open the story iframe, capture an actual screenshot, and compare it against the configured baseline.

Pseudo-state policy:

- Prefer story-controlled variants for hover, focus, active, selected, open, and disabled states.
- If a browser-forced state is necessary, configure `browserState` with `kind: 'hover' | 'focus'`, a selector, and effective animation stabilization.
- Reflection records `statePolicy` metadata in reports so reviewers can tell whether the state came from the story or was forced in the browser.

## Artifact roots

Local runs default to `.reflection`. CI runs default to `artifacts/reflection` when `--ci` is passed. Either can be overridden with `--report-dir`.

Baselines are separate from run artifacts. They live wherever `baselineRoot` plus `baseline` points, and normal runs never update them.
