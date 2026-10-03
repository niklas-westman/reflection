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

### Custom viewport sizes

A `viewports` entry can also be an object with an explicit size. Strings and objects can be mixed:

```ts
viewports: ['mobile', { name: 'design-1512', width: 1512, height: 982 }]
```

- `name` is the label used in check ids, metadata and artifact paths (`browser/<route-id>/design-1512/actual.png`). It must be unique on the route and must not reuse a preset name (`desktop`, `mobile`, `tablet`, `component`).
- The browser context uses exactly `width` x `height` with `deviceScaleFactor: 1`, so a 1512x982 viewport produces a 1512x982 PNG.
- Preset strings behave exactly as before.

### Full-page capture

Preset viewports capture the full scrollable page by default. Custom-size viewports capture exactly the viewport frame by default, because design references are fixed-size frames. Override either default per route:

```ts
{ id: 'board', path: '/board', viewports: [{ name: 'design-1512', width: 1512, height: 975 }], capture: { fullPage: true }, expects: [{ screenshot: 'final' }] }
```

`reflection doctor --config <path>` prints each route's viewports, including custom sizes.

## Route states and steps

A page with several modes can declare `states`. Each state runs from a **fresh navigation** (new browser context, so nothing leaks between states), executes its `steps`, then evaluates its own `expects` and captures its own screenshot:

```ts
routes: [
  {
    id: 'my-work',
    path: '/my-work',
    viewports: [{ name: 'design-1512', width: 1512, height: 982 }],
    expects: [{ noConsoleErrors: true }],
    states: [
      { id: 'start', expects: [{ role: 'heading', name: 'My work' }, { screenshot: 'final' }] },
      {
        id: 'overview',
        steps: [{ click: { role: 'button', name: 'Luna Larsson' } }],
        expects: [{ role: 'heading', name: 'Luna Larsson' }, { screenshot: 'final' }]
      },
      {
        id: 'chat',
        // To reach a deeper state, repeat the earlier steps: every state starts from a fresh page.
        steps: [{ click: { role: 'button', name: 'Luna Larsson' } }, { click: { role: 'button', name: 'Chat' } }],
        expects: [{ label: 'What is the latest?' }, { screenshot: 'final' }]
      }
    ]
  }
]
```

- Route-level `expects` apply to every state, before the state's own `expects`.
- A route without `states` behaves exactly as before. State ids may contain letters, digits, `.`, `_` and `-`, and must be unique per route.
- Check ids and artifacts include the state: `browser.<route>.<viewport>.<state>` and `browser/<route>/<viewport>/<state>/actual.png`.
- `visualSmoke` cases on a route with states must set `state`, and cases on a route without states must not.

Steps are declarative data (no scripts) and run after `setup` and before expectations:

| Step | Shape |
| --- | --- |
| `click` | `{ click: { role, name? } }`, or `{ label }`, `{ text }`, `{ selector }` as the target |
| `fill` | `{ fill: { label, value } }`, or `{ role, name?, value }`, `{ selector, value }` |
| `press` | `{ press: 'Enter' }` (any Playwright key name, sent to the focused element) |
| `waitFor` | `{ waitFor: { text \| role+name \| label \| selector \| networkIdle: true, timeoutMs? } }` |

Locators use Playwright's accessible queries and are strict: a locator matching several elements fails the step, so make the name specific. Actions time out after 5 seconds; `waitFor` takes `timeoutMs`.

A failing step fails only that state. The check summary names the step number and locator (for example `State "chat" step 2 (click role="button" name="Chat") failed: ...`), the remaining steps and expectations of that state are skipped, and `browser/<route>/<viewport>/<state>/failure.png` captures the page at the failure point. Other states still run.

## Network fixtures

`setup.network` stubs API responses and can fail on requests nobody stubbed. It is installed before navigation, so first-load requests are caught. Like other setup it can be set browser-wide and per route (route stubs are added after browser stubs):

```ts
setup: {
  network: {
    stubs: [
      { method: 'GET', url: '**/api/v2/candidates', status: 200, json: { items: [], total: 0 } },
      { method: 'GET', url: '**/api/v2/candidates/*', file: 'fixtures/candidate-luna.json' },
      { method: 'GET', url: '**/api/v2/candidates', status: 500, once: true }
    ],
    unmatched: 'fail'
  }
}
```

| Stub field | Notes |
| --- | --- |
| `url` | Glob matched with Playwright's URL matching. Required. |
| `method` | Optional; matches any method when omitted. |
| `status` | Defaults to `200`. |
| `json` / `file` / `body` | At most one. `file` is read relative to the config file's directory and may not leave it. Omit all three for an empty body. |
| `headers` | Extra response headers. `access-control-allow-origin: *` is added unless you set it. |
| `delayMs` | Delay before responding, for loading states. |
| `once` | Serve this stub for the first matching request only, then fall through to earlier stubs. |

**Precedence:** later stubs win. In the example the `500` is served once, then requests fall back to the earlier `200`, which gives you an error state followed by a recovery.

`unmatched` (default `allow`, which keeps today's behaviour) controls requests that no stub handled:

- `fail` aborts the request, fails the state with classification `unexpected-network-request`, and lists each `METHOD URL`.
- `warn` lets the request through and records a review warning (`pass-with-review`).
- Same-origin page assets (documents, scripts, styles, images, fonts, media) are never counted. Same-origin `fetch`/XHR calls and anything on another origin are, unless the origin is listed in `allowOrigins` (for example `allowOrigins: ['https://fonts.gstatic.com']`).

Check metadata records stub identities (method, url, status, source, `once`, hit count) and the unmatched requests, never response bodies.

## Fixed clock, timezone, locale and colour scheme

```ts
setup: {
  clock: { now: '2026-10-03T09:00:00+02:00' },
  timezone: 'Europe/Stockholm',
  locale: 'sv-SE',
  colorScheme: 'light',
  reducedMotion: 'reduce'
}
```

These can be set browser-wide with route-level overrides. Defaults are unchanged: `en-US`, `Europe/Stockholm`, `light`, no reduced-motion preference, real time.

`clock.now` fixes `Date`/`Date.now()` in the page (timers and animation frames keep running), so "Today", "Yesterday" and relative times render reproducibly. It does not change server time.

## Screenshot stability

Before a route screenshot Reflection masks `maskSelectors`, waits for readiness, then captures. Configure it at the browser level or per route (route overrides browser, key by key):

```ts
stability: {
  disableAnimations: true, // default false
  hideCaret: true,         // default true
  waitFor: ['fonts', 'images'], // default both
  settleMs: 0              // default 0, max 5000
}
```

- `waitFor: ['fonts']` waits for `document.fonts.ready`. `'images'` waits for in-flow images to load and decode (lazy-loaded images are not waited for, and the wait gives up after 5 seconds).
- `disableAnimations` uses Playwright's screenshot `animations: 'disabled'`: finite animations jump to their end state and infinite ones are cancelled.
- `hideCaret` hides the text caret.
- Viewport captures stay viewport captures unless `capture.fullPage` is set (see above).

Default behaviour only adds the fonts/images wait, which can only make screenshots more stable.

## Environment identity

`report.json` records `reflectionVersion`, `playwrightVersion`, `browser` (name and version), `os`, and any active run `filter` in `environment`. Each browser check records its own `metadata.environment`: viewport size, device scale factor, locale, timezone, colour scheme, reduced motion and whether the clock was fixed. A consumer can use these to tell "same scenario, different environment" from "different scenario".

## Console and layout failures

`noConsoleErrors` and `noHorizontalOverflow` are intentionally simple high-signal checks:

- `noConsoleErrors` catches runtime exceptions and error logs that can otherwise hide behind a passing screenshot.
- `noHorizontalOverflow` catches common responsive regressions before visual review.

These should usually be included on smoke routes.

## Screenshots are evidence

Browser screenshots are run artifacts under `.reflection/runs/<run-id>/browser/<route-id>/<viewport>/actual.png`, with route metadata beside them. They answer "what did this run render?"

They are not approved baselines. Approved baselines are separate files configured by `visualSmoke` or component visual cases. Normal `reflection run` does not create or mutate baselines.

See `docs/visual-contract.md` for visual comparison behavior.
