# Getting started with Reflection

Reflection is a local-first CLI for evidence-backed rendered UI validation. A configured run can start a dev server, visit routes, assert browser expectations, capture screenshots, compare visual baselines, and write reviewable reports.

Use this guide when adding Reflection to a new repository manually.

## 1. Install

Reflection is currently private and developed in this repository. In a consuming repo, install it the same way you install internal tooling once it is published or linked.

For local development inside this repository:

```bash
corepack pnpm install
corepack pnpm build
node dist/cli.js doctor
```

A package install should expose the CLI as:

```bash
reflection doctor
reflection run
reflection review
reflection update
reflection gc
```

## 2. Add a minimal config

Create `reflection.config.ts` at the repository root:

```ts
import { defineReflection } from 'reflection';

export default defineReflection({
  project: 'my-app',
  contracts: {
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
      routes: [
        {
          id: 'home',
          path: '/',
          viewports: ['desktop', 'mobile'],
          expects: [
            { role: 'heading', name: 'Home' },
            { noHorizontalOverflow: true },
            { noConsoleErrors: true },
            { screenshot: 'final' }
          ]
        }
      ]
    }
  }
});
```

If the package is not yet published, use the in-repo helper import path shown in `examples/basic-react/reflection.config.ts` while developing Reflection itself.

## 3. Run the local validation loop

```bash
reflection doctor
reflection run --config reflection.config.ts --mode smoke
reflection review --latest
```

During Reflection development, use the built CLI:

```bash
corepack pnpm build
node dist/cli.js doctor
node dist/cli.js run --config examples/basic-react/reflection.config.ts --mode smoke
node dist/cli.js review --latest
```

`reflection run` writes reports and artifacts under `.reflection/runs/<run-id>/` by default.

`reflection doctor` is currently a lightweight setup check. The configured project contract is exercised by `reflection run --config reflection.config.ts ...`.

Important files:

```text
.reflection/runs/latest
.reflection/runs/<run-id>/report.md
.reflection/runs/<run-id>/report.json
.reflection/runs/<run-id>/manifest.json
.reflection/runs/<run-id>/browser/**
.reflection/runs/<run-id>/visual/**
.reflection/runs/<run-id>/server/**
```

## 4. Understand the result

Reflection has three useful completion states:

- `pass` — blocking checks passed and there are no review-only visual items.
- `pass-with-review` — blocking checks passed, but there are review items such as non-strict visual diffs or missing baselines.
- `fail` / `error` — blocking validation failed or the tool could not complete.

Agents and CI should treat `fail` and `error` as task blockers. `pass-with-review` is intentionally not the same as failure: it asks a human or agent to inspect artifacts and decide whether visible changes are expected.

## 5. Add a visual baseline only after review

The first visual run may produce review items if no baseline exists yet. Inspect the actual screenshot first. If it is intentional, propose an update dry-run:

```bash
reflection update --config reflection.config.ts --route home --from-run latest --dry-run
```

Only after explicit human approval should a non-dry update run:

```bash
reflection update --config reflection.config.ts --route home --from-run latest
```

Normal `reflection run` never updates baselines.

## 6. Add a short agent pointer

Do not copy every Reflection rule into `AGENTS.md` or another agent file. Add a short pointer to the canonical process instead:

````md
## Reflection validation

Use Reflection as the UI evidence gate before claiming frontend work is complete.

Run:

```bash
reflection doctor
reflection run --config reflection.config.ts --mode smoke
reflection review --json
```

Rules:

- Treat blocking failures as task blockers.
- Summarize review items with artifact paths.
- Use `reflection update --dry-run` only to propose intentional visual changes.
- Do not run non-dry `reflection update` unless the human explicitly approves it.
- Never run `reflection update` in CI.

Full protocol: `docs/validation-process.md`.
````

See `docs/agent-workflows.md` for the agent-facing workflow and `docs/configuration.md` for the full config shape currently supported.
