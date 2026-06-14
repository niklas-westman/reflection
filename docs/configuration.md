# Reflection configuration

Reflection reads a project config from the path passed to `reflection run --config <path>`. Use `reflection.config.ts` as the conventional root filename. The config is validated before runners execute, so malformed contracts fail as setup errors instead of producing ambiguous reports.

The loader supports TypeScript config files (`.ts`, `.mts`, `.cts`) through `jiti` and JavaScript ESM config files through dynamic import.

## Minimal shape

```ts
import { defineReflection } from 'reflection-check';

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
  setup: {
    localStorage: {
      'reflection:test-mode': 'enabled'
    }
  },
  maskSelectors: ['[data-reflection-mask]'],
  routes: [
    {
      id: 'home',
      name: 'Home route',
      path: '/',
      viewports: ['desktop', 'mobile'],
      setup: {
        sessionStorage: {
          'reflection:route-state': 'ready'
        }
      },
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
| `setup` | Optional browser-level storage setup applied before route navigation. Values are not written to report metadata. |
| `maskSelectors` | Selectors masked in browser screenshots. |
| `routes` | Route assertions executed in `smoke` and `full` modes. |
| `visualSmoke` | Route screenshot baseline comparisons driven from successful browser screenshots. |

Route setup fields:

```ts
setup: {
  localStorage: {
    'reflection:test-user': 'fixture-user'
  },
  sessionStorage: {
    'reflection:test-session': 'fixture-session'
  }
}
```

Browser-level setup applies to every route. Route-level setup extends or overrides browser-level keys for that route. Reflection records only storage key names in metadata, never storage values. Use this for non-secret test-mode state, mock auth, or local fixture tokens. Do not commit real credentials or production session values in config.

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

Component visuals can render from Storybook or from a Reflection-generated portal. Storybook remains useful for existing projects; the portal is intended for strict design-system baselines where a dedicated route should render exactly one component state.

### Storybook runtime

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
      viewportSize: { width: 390, height: 220 },
      framing: {
        background: '#ffffff',
        align: 'center',
        padding: 0
      },
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

### Generated portal runtime

```ts
component: {
  enabled: true,
  portal: {
    entry: './tests/reflection/react-portal.tsx',
    readyUrl: 'http://127.0.0.1:6106',
    reuseExisting: true,
    timeoutMs: 60_000,
    viteConfig: './vite.config.ts'
  },
  cases: [
    {
      id: 'primary-button',
      path: '/reflection/button/primary/light',
      viewport: 'button-default',
      viewportSize: { width: 390, height: 220 },
      framing: {
        rootSelector: '#reflection-root',
        background: '#ffffff',
        align: 'center',
        padding: 0
      },
      baselineRoot: 'tests/fixtures/baselines',
      baseline: 'components/button/primary.chromium-linux.light.png',
      threshold: { maxDiffPixels: 0, maxDiffPixelRatio: 0 },
      strict: true,
      probes: {
        parts: {
          frame: {
            selector: '#reflection-root',
            bounds: true,
            styles: ['backgroundColor', 'padding']
          },
          component: {
            selector: '[data-reflection-part="root"]',
            bounds: true,
            styles: ['backgroundColor', 'borderColor', 'fontSize'],
            cssVariables: ['--design-token-color-primary'],
            text: true
          }
        }
      }
    }
  ]
}
```

Portal cases use `path` instead of `storyId`. Reflection generates a Vite-backed portal for the run, creates `#reflection-root` and `#reflection-case-root`, imports the configured `portal.entry`, and calls `mountReflectionCase` for the matching path.

The portal entry exports a mount function:

```ts
import type { ReflectionPortalMountInput } from 'reflection-check';

export function mountReflectionCase(input: ReflectionPortalMountInput) {
  input.root.textContent = input.id;
}
```

Portal cases must define `viewportSize`. Reflection uses that exact size for the browser viewport and for the generated portal frame. This keeps the config as the source of truth for frame dimensions.

### Shared case fields

`viewport` accepts the built-in presets (`desktop`, `tablet`, `mobile`, `component`) and any custom string label. When `viewportSize` is provided, Reflection captures at that exact `{ width, height }` instead of resolving the string preset. Use this for exported Figma baselines: the PNG dimensions must match `viewportSize` exactly or the check fails with `visual-dimension-mismatch`.

`framing` lets a component visual case normalize the runtime frame before the screenshot:

```ts
framing: {
  rootSelector: '#storybook-root',
  background: '#ffffff',
  align: 'center',
  padding: 0
}
```

Use it when the approved baseline is a fixed Figma frame: `background` should match the Figma frame fill, `align: 'center'` centers the component in the frame, and `padding` reserves explicit frame padding. `rootSelector` defaults to `#storybook-root` for Storybook cases and `#reflection-root` for portal cases.

`probes` are optional diagnostics. Reflection evaluates each selector after the
component is ready and before the screenshot, then stores bounds, computed
styles, selected CSS variables, text, and font metrics in `report.json`. Use
probes to make failures easier to classify; they do not mutate the page or
change pass/fail behavior.

Case/runtime rules:

- Storybook cases use `storyId` and require `component.storybook`.
- Portal cases use `path` and require `component.portal`.
- A case cannot define both `storyId` and `path`.
- Portal cases require `viewportSize`; strict Figma baselines should not rely on implicit preset dimensions.

Pseudo-state policy:

- Prefer runtime-controlled variants for hover, focus, active, selected, open, and disabled states.
- If a browser-forced state is necessary, configure `browserState` with `kind: 'hover' | 'focus'`, a selector, and effective animation stabilization.
- Reflection records `statePolicy` metadata in reports so reviewers can tell whether the state came from the story or was forced in the browser.

## Artifact roots

Local runs default to `.reflection`. CI runs default to `artifacts/reflection` when `--ci` is passed. Either can be overridden with `--report-dir`.

Baselines are separate from run artifacts. They live wherever `baselineRoot` plus `baseline` points, and normal runs never update them.
