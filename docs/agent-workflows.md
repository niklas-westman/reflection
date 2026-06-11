# Agent workflows

Reflection is meant to give agents an evidence gate for rendered UI work. Agents should use it to observe and report, not to silently heal visual changes.

## Core agent loop

Before claiming frontend work is complete:

```bash
reflection doctor --config reflection.config.ts
reflection run --config reflection.config.ts --mode smoke
reflection review --json
```

`reflection doctor --config` validates config loading/schema, summarizes enabled contracts and server settings, checks local runtime readiness, and remains read-only.

If the project uses a non-default config path or report root, pass it explicitly:

```bash
reflection doctor --config path/to/reflection.config.ts
reflection run --config path/to/reflection.config.ts --mode smoke --report-dir .reflection
reflection review --report-dir .reflection --json
```

For first-time setup discovery, agents may run the read-only preview:

```bash
reflection init --dry-run --preset vite-react
```

The init command currently previews proposed config and scripts only. Do not assume it wrote files, and do not run any future write mode without explicit human approval.

## How to interpret review JSON

Treat the review summary as the handoff contract:

- `status: "pass"` — validation passed.
- `status: "pass-with-review"` — blocking checks passed, but the agent must summarize review items and artifact paths.
- `status: "fail"` — blocking failures must be fixed before completion.
- Tool/configuration errors mean the validation did not complete; report the blocker and fix setup when in scope.

A good completion message includes:

- commands run;
- status;
- report path;
- blocking failures, if any;
- review items, if any;
- artifact paths for changed/failing UI;
- whether any baseline update was dry-run only or human-approved non-dry.

## Baseline update policy for agents

Agents may propose a baseline update only with a dry run:

```bash
reflection update --route <routeId> --from-run latest --dry-run
reflection update --case <routeVisualCaseId> --from-run latest --dry-run
```

`reflection update` currently targets route-level `visualSmoke` baselines. Component visual baseline promotion is still a manual review/copy step.

Do not run non-dry `reflection update` unless the human explicitly approves that exact target.

Never run `reflection update` in CI.

After a human-approved non-dry update:

1. Inspect the git diff.
2. Report exactly which baseline files changed.
3. Re-run `reflection run` and `reflection review --json` if the task requires proof that the new baseline now passes.

## Handling `pass-with-review`

`pass-with-review` is useful. It means the functional/browser contract did not block, but some artifact needs human attention.

For visual diffs, include:

- check id;
- target route/story and viewport;
- expected image path;
- actual image path;
- diff image path;
- threshold metadata if present;
- whether the case is review-only or strict/blocking.

Do not hide review items behind "tests passed". The review item is the reason Reflection exists.

## Suggested agent-file section

Repository agent files should include a short pointer, not a copy of this whole guide.

Supported files to update, in order of preference:

- existing `AGENTS.md`;
- existing `CLAUDE.md`;
- existing `.github/copilot-instructions.md`;
- existing `copilot-instructions.md`;
- create `AGENTS.md` only if none exists.

Suggested section:

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
- Summarize review items with artifact paths for the human.
- Use `reflection update --route <routeId> --from-run latest --dry-run` only to propose intentional visual changes.
- Do not run non-dry `reflection update` unless the human explicitly approves it.
- Never run `reflection update` in CI.

Full protocol: `docs/validation-process.md`.
````

## CI workflow

CI should run Reflection and upload artifacts, but never update baselines:

```bash
reflection doctor --config reflection.config.ts
reflection run --ci --config reflection.config.ts --mode smoke
reflection review --report-dir artifacts/reflection --json
```

`reflection run --ci` writes to `artifacts/reflection` by default, so pass the same report root to `review`.

Upload the report root even on failure:

```text
artifacts/reflection/**
```

See `docs/ci.md` for current CI-specific defaults and exit codes.

## Common mistakes

- Treating generated evidence screenshots as baselines.
- Running non-dry `reflection update` without human approval.
- Ignoring `pass-with-review` because the shell exit code is `0`.
- Deleting run artifacts before reporting the artifact paths.
- Copying long Reflection instructions into multiple agent files and letting them drift.
- Forgetting `--report-dir` when reviewing a CI or custom-root run.
