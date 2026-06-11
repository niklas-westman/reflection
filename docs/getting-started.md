# Getting started with Reflection

Reflection is a local-first CLI for evidence-backed rendered UI validation. A configured run can start a dev server, visit routes, assert browser expectations, capture screenshots, compare visual baselines, and write reviewable reports.

Use this guide when adding Reflection to a new repository manually.

## 1. Install

Install the package as a development dependency:

```bash
pnpm add -D reflection-check
```

Then verify the CLI is available:

```bash
pnpm exec reflection doctor
```

The package install exposes both `reflection` and `reflection-check` binaries. The docs use `reflection` as the primary command.

You can preview the setup Reflection would suggest without writing files:

```bash
pnpm exec reflection init --dry-run --preset vite-react
```

`init --dry-run` prints proposed install commands, config, and script guidance. It is read-only; creating or updating files still happens manually.

For local tarball testing before a registry publish, create and install a packed artifact instead.

From the Reflection repository:

```bash
pnpm install --frozen-lockfile
pnpm pack
```

From the consuming repository:

```bash
pnpm add -D /absolute/path/to/reflection/reflection-check-0.0.1.tgz
pnpm exec reflection doctor
```

## 2. Add a minimal config

Create `reflection.config.ts` at the repository root:

```ts
import { defineReflection } from 'reflection-check';

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

During Reflection repository development, the in-repo fixture imports the helper from source instead of the published package.

## 3. Run the local validation loop

```bash
reflection doctor
reflection run --config reflection.config.ts --mode smoke
reflection review --latest
```

Pass the config to `doctor` when you want a read-only preflight of the consuming repository setup:

```bash
reflection doctor --config reflection.config.ts
```

During Reflection development, use the built CLI:

```bash
pnpm build
node dist/cli.js doctor --config examples/basic-react/reflection.config.ts
node dist/cli.js run --config examples/basic-react/reflection.config.ts --mode smoke
node dist/cli.js review --latest
```

`reflection run` writes reports and artifacts under `.reflection/runs/<run-id>/` by default.

`reflection doctor --config` validates that the config can be loaded, summarizes enabled contracts and server settings, checks local runtime readiness, and does not start servers or mutate baselines. Use `--check-server` when you explicitly want it to probe the configured server `readyUrl` without starting the server.

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
reflection doctor --config reflection.config.ts
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
