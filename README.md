# Reflection

Reflection is a CLI for evidence-backed rendered UI validation.

It answers three practical questions for frontend changes:

```text
Does the UI still work?
Does it still match the design system contract?
Did anything visible change unexpectedly?
```

Current status: Reflection now has the core local validation loop: config → browser route check → screenshot/visual evidence → report → review → explicit baseline update.

## Documentation

- [`docs/getting-started.md`](docs/getting-started.md) — add Reflection to a new repo and run the local loop.
- [`docs/configuration.md`](docs/configuration.md) — supported config shape, run modes, browser/design/component contracts.
- [`docs/browser-contract.md`](docs/browser-contract.md) — rendered route expectations and screenshot evidence.
- [`docs/visual-contract.md`](docs/visual-contract.md) — route/component baselines, review-only diffs, and baseline update policy.
- [`docs/artifacts-and-gc.md`](docs/artifacts-and-gc.md) — report bundle layout, artifact roots, and safe garbage collection.
- [`docs/agent-workflows.md`](docs/agent-workflows.md) — agent completion loop and baseline-update rules.
- [`docs/validation-process.md`](docs/validation-process.md) — canonical operating guide for agents and CI.
- [`docs/ci.md`](docs/ci.md) — CI defaults and exit codes.
- [`docs/target-ir-and-adapters.md`](docs/target-ir-and-adapters.md) — internal target inventory and adapter seam.

## Command surface

```bash
reflection run
reflection review
reflection update
reflection doctor
```

## Local development

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
```
