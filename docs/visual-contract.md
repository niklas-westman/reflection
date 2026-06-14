# Visual contract

The visual contract compares current screenshots against approved baseline images. It is deliberately review-first: visual diffs are review-only by default, and baseline updates are explicit human-approved mutations.

Reflection currently supports two visual surfaces:

- route-level visual smoke cases from browser route screenshots;
- component visual cases rendered through Storybook or the Reflection-generated portal.

## Evidence screenshots vs baselines

Keep these concepts separate:

| Concept | Location | Created by | Meaning |
| --- | --- | --- | --- |
| Evidence screenshot | `.reflection/runs/<run-id>/**` or configured report root | `reflection run` | What the current run rendered. Safe to regenerate. |
| Baseline image | Configured `baselineRoot` + `baseline` | `reflection update` after review, or manual fixture setup | Approved reference image. Should be source-controlled when intentional. |
| Diff image | `.reflection/runs/<run-id>/visual/**/diff.png` | `reflection run` during comparison | Highlight of pixels that differ between evidence and baseline. |

Normal runs never mutate baselines.

## Review-only default

A visual mismatch or missing baseline is review-only unless the case opts into strict/blocking behavior.

Use review-only defaults while adopting Reflection:

```ts
visualSmoke: [
  {
    id: 'home-mobile',
    route: 'home',
    viewport: 'mobile',
    baselineRoot: 'tests/fixtures/baselines',
    baseline: 'browser/home/mobile.chromium-linux.light.png'
  }
]
```

Promote a visual case to blocking only when the baseline is stable and the team wants CI/task completion to fail on visual drift:

```ts
{
  id: 'home-mobile',
  route: 'home',
  viewport: 'mobile',
  baseline: 'browser/home/mobile.chromium-linux.light.png',
  strict: true
}
```

`strict: true` or `blocking: true` makes a failing visual comparison blocking. Otherwise it produces `pass-with-review` so the artifact can be inspected without hiding the change.

## Route-level visual smoke

Route visual smoke cases reuse browser route screenshots. A case must point at a configured route id and viewport:

```ts
browser: {
  routes: [
    {
      id: 'login',
      path: '/login',
      viewports: ['mobile'],
      expects: [{ screenshot: 'final' }]
    }
  ],
  visualSmoke: [
    {
      id: 'login-mobile',
      route: 'login',
      viewport: 'mobile',
      baselineRoot: 'tests/fixtures/baselines',
      baseline: 'browser/login/mobile.chromium-linux.light.png',
      threshold: { maxDiffPixelRatio: 0.01 }
    }
  ]
}
```

If the matching browser route result is missing, the visual check becomes a review item by default or a blocking failure when strict/blocking is enabled.

## Component visual baselines

Component visual cases can use Storybook or a Reflection-generated portal. Storybook cases resolve `storyId` through Storybook `/index.json`; portal cases open a configured `path` in a generated Vite runtime.

```ts
component: {
  storybook: {
    command: 'pnpm storybook --host 127.0.0.1 --port 6006',
    readyUrl: 'http://127.0.0.1:6006',
    reuseExisting: true,
    timeoutMs: 60_000
  },
  cases: [
    {
      id: 'button-primary',
      storyId: 'atoms-button--primary',
      viewport: 'button-default',
      viewportSize: { width: 390, height: 220 },
      framing: {
        background: '#ffffff',
        align: 'center',
        padding: 0
      },
      baselineRoot: 'tests/fixtures/baselines',
      baseline: 'components/button/primary.chromium-linux.light.png',
      threshold: { maxDiffPixelRatio: 0.005 }
    }
  ]
}
```

Portal cases use the same case fields, but replace `storyId` with `path` and configure `component.portal`:

```ts
component: {
  portal: {
    entry: './tests/reflection/react-portal.tsx',
    readyUrl: 'http://127.0.0.1:6106'
  },
  cases: [
    {
      id: 'button-primary',
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
          root: {
            selector: '[data-reflection-part="root"]',
            bounds: true,
            styles: ['backgroundColor', 'borderColor', 'fontSize'],
            cssVariables: ['--mw-color-primary-base']
          }
        }
      }
    }
  ]
}
```

For component baselines exported from a design tool, treat `viewportSize` and `framing` as part of the visual contract. The exported PNG width/height and the runtime screenshot width/height must be identical. `viewport` may be a built-in preset such as `component` or a semantic custom label such as `button-default`; when `viewportSize` is present, the explicit dimensions win. Portal cases require `viewportSize`, and the generated frame uses those dimensions directly.

`framing` is optional and only affects the screenshot when configured. It applies fixed canvas styles before capture so the runtime component can match a Figma frame:

- `rootSelector`: root to frame; defaults to `#storybook-root` for Storybook and `#reflection-root` for portal cases.
- `background`: CSS background matching the Figma frame fill.
- `align`: `center` or `start`; `center` places the component in the middle of the frame.
- `padding`: integer pixel padding inside the frame.

`probes` are optional runtime diagnostics for portal and Storybook component
cases. They do not change screenshot capture. They record DOM bounds, computed
styles, selected CSS variables, text, and font metrics into `report.json` so a
consumer can map a visual failure back to tokens, framing, or fixture state.

```ts
probes: {
  parts: {
    root: {
      selector: '[data-reflection-part="root"]',
      bounds: true,
      styles: ['backgroundColor', 'borderColor', 'fontSize'],
      cssVariables: ['--design-token-color-primary'],
      text: true
    }
  }
}
```

### Pseudo states

Prefer story-controlled states. A story named `Button/Hover` or `Button/Focused` is usually more deterministic than moving the mouse in the browser.

When the browser must force a state, Reflection requires effective animation stabilization:

```ts
{
  id: 'button-hover',
  storyId: 'atoms-button--primary',
  baseline: 'components/button/hover.chromium-linux.light.png',
  stateNote: 'Browser-forced hover until a story-controlled hover variant exists.',
  browserState: {
    kind: 'hover',
    selector: 'button',
    animationStabilization: {
      disableAnimations: true
    }
  }
}
```

Reports include `statePolicy` metadata:

- `story-controlled` when no `browserState` is configured;
- `portal-controlled` when the generated portal renders the state;
- `browser-forced-with-stabilization` when Reflection applies hover/focus in the browser.

## Thresholds

Visual thresholds support:

```ts
threshold: {
  maxDiffPixels: 25,
  maxDiffPixelRatio: 0.01
}
```

`maxDiffPixelRatio: 0` is valid and means exact pixel matching. Reflection preserves zero-valued thresholds intentionally.

## Diff diagnostics

When a visual comparison fails or warns, Reflection records lightweight diagnostics in `report.json` and `reflection review --json`. The human `report.md` stays compact, links to `report.json`, and surfaces summary-level visual budget categories. These diagnostics do not replace human review, but they make the first triage more useful than a raw percentage.

The diagnostic layer reports:

- the changed bounding box;
- changed-area ratio and changed-pixel density;
- whether the change looks broad/framing-related, localized, sparse text/antialiasing-related, or color/token-related;
- likely next checks such as viewport/framing, typography, text wrapping, theme tokens, state variants, borders, and icons.
- a first-pass `failureClass` such as `framing-layout-mismatch`, `token-mismatch`, `runtime-implementation-mismatch`, `adapter-fixture-mismatch`, or `render-noise`;
- optional structured `evidence`, `diagnostics`, and `recommendations` fields on each failed or review visual check.

Treat these as heuristics. A `sparse-text-or-antialiasing` category should push review toward font loading, font weight, letter spacing, line height, and wrapping before changing thresholds. A `color-or-token-drift` category should push review toward theme mode, token bindings, opacity, state variant, and border/background colors.

## Updating baselines

Always inspect artifacts first:

```bash
reflection review --json
```

Then dry-run a targeted update:

```bash
reflection update --route login --from-run latest --dry-run
reflection update --case login-mobile --from-run latest --dry-run
```

Only after explicit human approval:

```bash
reflection update --route login --from-run latest
reflection update --case login-mobile --from-run latest
```

`reflection update` currently promotes route-level `visualSmoke` baselines. For component visual cases, inspect the run artifacts and copy an approved `actual.png` to the configured component baseline path manually until targeted component baseline promotion is implemented.

After a non-dry update, inspect the git diff and report exactly which baseline files changed.

CI must never update baselines. `reflection update --ci` is refused.
