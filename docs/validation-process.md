# Reflection validation process

Reflection is meant to be a validation protocol that humans, agents, and CI can run without guessing what changed or whether visual evidence is safe to accept.

The command split is intentional:

```bash
reflection doctor  # lightweight CLI/setup check; project contracts run through --config
reflection run     # produce evidence and report.json; pass --config for project contracts
reflection review  # summarize the latest evidence for humans/agents
reflection update  # accept intentional visual changes; never automatic
```

## Local validation loop

Use this loop before claiming frontend work is complete:

```bash
reflection doctor
reflection run --config reflection.config.ts --mode smoke
reflection review --json
```

If Reflection is being run from this repository during development, build first and use the local CLI:

```bash
corepack pnpm build
node dist/cli.js doctor
node dist/cli.js run --config examples/basic-react/reflection.config.ts --mode smoke
node dist/cli.js review --json
```

Interpret the review result as the contract:

- `status: "pass"` means the validation evidence passed.
- `status: "pass-with-review"` means blocking checks passed, but review items need a human-readable summary and artifact links.
- `status: "fail"` means blocking checks failed; fix those before calling the work complete.

Always include the `reportPath`, blocking failures, review items, and artifact paths when reporting results to a human.

## Agent instructions

Agents should treat Reflection as an evidence gate, not as a self-healing tool.

Required agent behavior:

1. Run `reflection doctor` before the validation flow when setup may be uncertain. It is currently a lightweight setup check; the configured project contract is exercised by `reflection run --config ...`.
2. Run `reflection run --config reflection.config.ts --mode smoke` to generate current evidence.
3. Run `reflection review --json` to get the machine-readable summary.
4. Fix blocking failures before finishing the task.
5. Summarize review items with artifact paths instead of hiding them.
6. Never run non-dry `reflection update` without explicit human approval.
7. Never run `reflection update` in CI.

Agents may propose intentional baseline changes with a dry run:

```bash
reflection update --route <routeId> --from-run latest --dry-run
reflection update --case <routeVisualCaseId> --from-run latest --dry-run
```

`reflection update` currently promotes route-level `visualSmoke` baselines. Component visual baselines still require manual review/copy until component baseline promotion is implemented.

Only after explicit human approval may an agent run the matching non-dry update:

```bash
reflection update --route <routeId> --from-run latest
# or
reflection update --case <routeVisualCaseId> --from-run latest
```

After any non-dry update, inspect the resulting git diff and report exactly which baseline files changed.

## CI validation loop

CI should generate and publish evidence, but must never update baselines.

Recommended CI command shape:

```bash
reflection doctor
reflection run --ci --config reflection.config.ts --mode smoke
reflection review --report-dir artifacts/reflection --json
```

`reflection run --ci` writes to `artifacts/reflection` by default. `reflection review` defaults to `.reflection`, so CI review commands must pass the CI report root explicitly.

For this repository's built CLI:

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm build
node dist/cli.js doctor
node dist/cli.js run --ci --config examples/basic-react/reflection.config.ts --mode smoke
node dist/cli.js review --report-dir artifacts/reflection --json
```

Upload Reflection run artifacts even on failure so humans and agents can inspect what happened:

```text
artifacts/reflection/**
```

For local non-CI runs, the default report root remains `.reflection`. If a project config or command uses `--report-dir`, upload and review that explicit report root instead.

## Baseline update policy

Reflection does not silently heal visual diffs.

- Normal `reflection run` must not create or update baselines.
- `reflection update --dry-run` is safe for agents to use when proposing a change.
- Non-dry `reflection update` is a human-approved mutation step.
- CI must treat any `reflection update` attempt as invalid.
- Prefer targeted updates (`--route` or `--case`) over `--all`.
- `--all` must be explicit and should be reserved for deliberate broad rebaselines.

## Adding Reflection to repository agent files

Reflection keeps its canonical operating instructions in this file. Repository-level agent files should carry only a short pointer section so agents discover the validation process without duplicating the whole protocol.

Use this file-selection logic when adding Reflection to a repository:

1. Look for existing agent instruction files:
   - `AGENTS.md`
   - `CLAUDE.md`
   - `.github/copilot-instructions.md`
   - `copilot-instructions.md`
2. If one or more of those files already exist, add the Reflection validation section to the existing file or files and do not create another agent instruction file.
3. If none of those files exist, create `AGENTS.md` and add the Reflection validation section there.
4. Keep the canonical process in `docs/validation-process.md`; the agent instruction file should point here instead of copying this full guide.

Suggested section:

````markdown
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
- Summarize review items with artifact paths for the human.
- Use `reflection update --route <routeId> --from-run latest --dry-run` only to propose intentional visual changes.
- Do not run non-dry `reflection update` unless the human explicitly approves it.
- Never run `reflection update` in CI.

Full protocol: `docs/validation-process.md`.
````

Do not duplicate the full protocol into repository-level agent files. Keep the detailed process here and add only the pointer section above to the selected existing agent file, or to a new `AGENTS.md` when no supported agent instruction file exists.

## Minimum completion evidence

When reporting a completed Reflection validation run, include:

- command(s) run
- pass/fail status
- report path
- blocking failures, if any
- review items, if any
- artifact paths relevant to changed or failing UI
- whether any baseline update was dry-run only or human-approved non-dry

A good final agent message should make the evidence easy to inspect without requiring the human to re-run commands immediately.
