# Visual contract

The visual contract compares current screenshots against approved baseline images. It is deliberately review-first: visual diffs are review-only by default, and baseline updates are explicit human-approved mutations.

Reflection currently supports two visual surfaces:

- route-level visual smoke cases from browser route screenshots;
- Storybook component visual cases.

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

Component visual cases use Storybook. Reflection resolves the configured `storyId` through Storybook `/index.json`, opens the iframe URL, captures a screenshot, and compares it with the configured baseline.

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
      viewport: 'component',
      baselineRoot: 'tests/fixtures/baselines',
      baseline: 'components/button/primary.chromium-linux.light.png',
      threshold: { maxDiffPixelRatio: 0.005 }
    }
  ]
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
