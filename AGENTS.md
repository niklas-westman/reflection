# Agent instructions

## Project plan

Read `PLAN.md` first in every session. It is the living checklist: what the product is, what is done, what is "Now", what is next, and what is undecided.

- Check a box in the same change that finishes the work, and add a line to its change log. A box is checked only when the step is built and verified.
- Keep exactly one item as "Now". New work goes into the area it belongs to as an unchecked box.
- Push, tag, publish, version bumps, deploys, Discord posts and any write to Figma, Penpot, or the Marwes and Sourcer repositories need the owner's go-ahead. Local commits of verified steps do not.

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
