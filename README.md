# Reflection

Reflection is a CLI for evidence-backed rendered UI validation.

It answers three practical questions for frontend changes:

```text
Does the UI still work?
Does it still match the design system contract?
Did anything visible change unexpectedly?
```

Current status: Reflection now has the core local validation loop: config → browser route check → screenshot/visual evidence → report → review → explicit baseline update.

For agent and CI usage, see [`docs/validation-process.md`](docs/validation-process.md). That file is the canonical operating guide for running Reflection as a validation process and for safely proposing intentional visual baseline updates.

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
