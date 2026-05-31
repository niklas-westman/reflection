# Reflection

Reflection is a CLI for evidence-backed rendered UI validation.

It answers three practical questions for frontend changes:

```text
Does the UI still work?
Does it still match the design system contract?
Did anything visible change unexpectedly?
```

Current status: project skeleton and implementation plan. Day 1 should focus on the smallest useful loop: config → browser route check → screenshot evidence → report → exit code.

## Planned command surface

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
