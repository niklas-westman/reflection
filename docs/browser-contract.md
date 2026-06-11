# Browser contract

The browser contract validates rendered routes in a real browser. It answers: can the app render the expected route, at the expected viewport, without obvious layout or console regressions?

Browser route checks run in `smoke` and `full` modes.

## What a route check does

For each configured route and viewport, Reflection:

1. Starts or reuses the configured app server.
2. Opens `baseUrl + route.path` in Playwright.
3. Applies configured screenshot masking selectors.
4. Evaluates route expectations.
5. Captures screenshot evidence when requested.
6. Emits a structured `CheckResult` into `report.json`.

A route check is browser evidence, not a baseline approval. A screenshot captured by `{ screenshot: 'final' }` is evidence for the current run. It becomes a visual comparison input only when referenced by a `visualSmoke` case.

## Config example

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
      id: 'login',
      path: '/login',
      viewports: ['desktop', 'mobile'],
      setup: {
        sessionStorage: {
          'reflection:login-state': 'ready'
        }
      },
      expects: [
        { role: 'heading', name: 'Login' },
        { label: 'Email' },
        { label: 'Password' },
        { role: 'button', name: 'Sign in' },
        { noText: 'Register' },
        { noHorizontalOverflow: true },
        { noConsoleErrors: true },
        { screenshot: 'final' }
      ]
    }
  ]
}
```

## Route setup for authenticated fixtures

Use `setup.localStorage` and `setup.sessionStorage` to seed non-secret test state before Reflection navigates to a route:

```ts
routes: [
  {
    id: 'authenticated-home',
    path: '/',
    setup: {
      localStorage: {
        'reflection:test-user': 'fixture-user'
      }
    },
    expects: [{ text: 'Welcome fixture-user' }]
  }
]
```

Browser-level setup applies to every route, and route-level setup extends or overrides it. Reflection records only setup key names in metadata so reports show that setup ran without logging values. Keep real credentials and production session values out of committed config; prefer test-mode auth or mock fixture tokens.

## Expectations

| Expectation | Use for |
| --- | --- |
| `urlIncludes` | Route redirects or canonical URL fragments. |
| `urlEquals` | Exact final URL checks. |
| `role` + optional `name` | Accessible UI assertions; preferred for user-visible structure. |
| `label` | Form field labels. |
| `text` | Required visible text. |
| `noText` | Text that must not appear, such as old copy or errors. |
| `selector` | A CSS selector that must exist. |
| `elementVisible` | A CSS selector that must be visible. |
| `elementNotVisible` | A CSS selector that must not be visible. |
| `noHorizontalOverflow` | Mobile/layout guard against body-level horizontal overflow. |
| `noConsoleErrors` | Fails on browser console errors captured during the route visit. |
| `screenshot` | Captures current route screenshot evidence. |

Prefer accessible expectations (`role`, `label`, visible text) before selectors. Selectors are useful for stable app-specific contracts, but they should not become a substitute for testing what a user can perceive.

## Viewports

Routes can list one or more named viewports:

```ts
viewports: ['desktop', 'mobile']
```

Reflection stores viewport metadata in each route check. Route-level visual smoke cases match against this metadata, so the `route` and `viewport` fields in a `visualSmoke` case must correspond to an actual browser route result.

## Console and layout failures

`noConsoleErrors` and `noHorizontalOverflow` are intentionally simple high-signal checks:

- `noConsoleErrors` catches runtime exceptions and error logs that can otherwise hide behind a passing screenshot.
- `noHorizontalOverflow` catches common responsive regressions before visual review.

These should usually be included on smoke routes.

## Screenshots are evidence

Browser screenshots are run artifacts under `.reflection/runs/<run-id>/browser/<route-id>/<viewport>/actual.png`, with route metadata beside them. They answer "what did this run render?"

They are not approved baselines. Approved baselines are separate files configured by `visualSmoke` or component visual cases. Normal `reflection run` does not create or mutate baselines.

See `docs/visual-contract.md` for visual comparison behavior.
