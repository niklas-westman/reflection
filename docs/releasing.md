# Releasing

Two packages are published from this repository: `reflection-check` (the engine, at the repository root) and `reflection-projection` (the provider toolkit, in `packages/projection`). The viewer (`packages/ui`) is an app and stays private.

Publishing cannot be undone: a version, once published, cannot be replaced. Check first, publish once.

## Before publishing

1. Be on `main` with everything committed and pushed. The private planning briefs are untracked on purpose and are not part of any package.
2. Run every check:

   ```bash
   pnpm check                      # engine: typecheck, tests, build
   pnpm check:packages             # projection, then the viewer
   pnpm smoke:package              # packs the engine, installs it in an empty project, runs it
   pnpm --filter reflection-projection smoke:package   # the same for the provider toolkit
   ```

3. Check what would be published. `npm pack --dry-run --ignore-scripts` lists the files. The engine ships `dist`, `docs`, `LICENSE` and `README.md`; the toolkit ships `dist`, `schema`, `docs`, `LICENSE` and `README.md`. Nothing else.
4. Check the version. A change to a config, report or schema that existing users could not ignore is a major change; an additive field or feature is a minor change; a fix is a patch. Add a section to `docs/upgrading.md` for the engine.
5. Be logged in: `npm whoami` must print your user name. If it answers `401`, run `npm login`.

## Publish

```bash
# the engine, from the repository root (prepack builds it; access is public)
npm publish

# the provider toolkit
cd packages/projection && npm publish
```

If npm asks for a one-time code, add `--otp=<code>`. Do not tag a version unless you want to: this repository has not kept tags since `v0.1.1`.

## Verify

```bash
npm view reflection-check version
npm view reflection-projection version
```

Then install the published versions into an empty folder and run `reflection doctor` and the toolkit's smoke flow against them, so what was tested is what people get.

## After publishing

Update the version in `PLAN.md`, and tell anyone who pins an older version what changed (the upgrade notes). A provider that reports a problem is answered with a new patch or minor version, not by changing a published one.
