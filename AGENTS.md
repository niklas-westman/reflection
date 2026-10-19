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

### The viewer (`packages/ui`)

Reflection runs on its own viewer. After changing the viewer, also run its smoke gate from the repository root (build the engine first with `pnpm build`):

```bash
pnpm --filter reflection-ui reflect
node dist/cli.js review --json
```

It opens every viewer route against the generated demo bundles in two desktop widths and fails on a missing heading, a console error or sideways page scroll. When you add a route, add it to `packages/ui/reflection.config.ts`. The viewer has visual baselines (14 routes, lossless WebP, in `packages/ui/tests/visual-baselines`, named for the platform they were made on: `chromium-darwin`). A difference is a review item, not a failure. When a change to the viewer is intended, inspect the diff, propose it with `reflection update --config packages/ui/reflection.config.ts --all --from-run latest --dry-run`, and promote it only with the human's approval.
