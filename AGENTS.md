# Agent instructions

## Reflection validation

Use Reflection as the UI evidence gate before claiming frontend work is complete.

Run:

```bash
reflection doctor
reflection run --mode smoke
reflection review --json
```

Rules:

- Treat blocking failures as task blockers.
- Summarize review items with artifact paths for the human.
- Use `reflection update --route <routeId> --from-run latest --dry-run` only to propose intentional visual changes.
- Do not run non-dry `reflection update` unless the human explicitly approves it.
- Never run `reflection update` in CI.

Full protocol: `docs/validation-process.md`.
