# Target IR and adapters

Reflection keeps external input formats separate from the contract runners by compiling them into a small Target IR: a normalized inventory of things Reflection can validate.

```text
Reflection config      optional adapters
       │                    │
       └──────────┬─────────┘
                  ▼
              Target IR
                  ▼
          contract runners / reports
```

## Why Target IR exists

Target IR is the seam between _where validation targets come from_ and _how Reflection validates them_. The current Reflection config is one source. Future integrations can compile their own manifests into the same shape without making browser, visual, component, or design runners depend on that integration.

This gives us three useful constraints:

- **Neutral core:** runner code should work from Reflection concepts, not external product names.
- **Optional adapters:** adapters can be present or absent without changing normal `reflection run` behavior.
- **Agent-readable inventory:** agents can inspect a single list of targets and understand the validation surface.

## Current target families

The IR currently supports four families:

| Family | Source contract | Typical run modes | Purpose |
| --- | --- | --- | --- |
| `browser-route` | browser routes | `smoke`, `full` | Render a route and evaluate DOM/layout/console expectations. |
| `route-visual` | browser visual smoke cases | `smoke`, `full` | Compare route screenshots against read-only baselines. |
| `component-visual` | Storybook component cases | `visual`, `full` | Compare component story screenshots against read-only baselines. |
| `design-command` | design command checks | `design`, `full` | Run project-owned design contract commands. |

All targets include:

- `id` — stable target id.
- `family` — one of the target families above.
- `source` — where the target came from, for example `reflection-config` or `adapter`.
- `runModes` — modes where the target is relevant.
- `blocking` — whether a failing target should block the run.

## Reflection config compiler

`compileReflectionTargets(config)` compiles the typed Reflection config into Target IR.

Example:

```ts
const ir = compileReflectionTargets(config);

console.log(ir.targets.map((target) => `${target.family}:${target.id}`));
// [
//   'browser-route:login',
//   'route-visual:login-mobile',
//   'component-visual:button-primary',
//   'design-command:tokens'
// ]
```

The compiler preserves visual metadata that matters to later review, including zero-valued thresholds, explicit component `viewportSize` values, and component `framing`. Do not use truthiness checks when copying optional numeric metadata; use explicit `!== undefined` checks so values like `0` survive.

## Adapter contract

Adapters should compile their input into the same target shape and mark targets with `source: 'adapter'`.

Adapters must not make core runners aware of the source format. The runner should receive normalized route/story/visual/command information and should not branch on adapter names.

A good adapter is:

- **optional** — normal Reflection config works without it;
- **validated** — malformed adapter input fails before runner execution;
- **neutral** — no external product names leak into core commands or reports unless the user explicitly names their own target ids;
- **lossless enough for review** — route paths, viewports, component viewport sizes, component framing, expectations, baselines, thresholds, and blocking semantics are preserved in IR.

## Route manifest adapter proof

Phase 6.2 adds a fixture JSON route-manifest adapter in `src/adapters/route-manifest.ts`. Its job is deliberately narrow: prove that an external manifest can become browser-route Target IR without changing the browser runner.

The manifest shape is:

```json
{
  "project": "example-app",
  "baseUrl": "http://127.0.0.1:5173",
  "routes": [
    {
      "id": "login",
      "path": "/login",
      "viewports": ["desktop", "mobile"],
      "expects": [{ "role": "heading", "name": "Welcome" }],
      "blocking": true
    }
  ]
}
```

That adapter emits `browser-route` targets using the generic Target IR. It does not introduce a new runner or a new user-facing external product concept.

Use the pure parser for already-loaded JSON:

```ts
const ir = parseRouteManifestTargets(routeManifestJson);
```

Use the loader when the manifest lives on disk:

```ts
const ir = await loadRouteManifestTargets('routes.json');
```
