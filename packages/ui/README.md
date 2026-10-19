# reflection-ui

A read-only viewer for Reflection evidence bundles (see `reflection-projection`). It shows what was proven for each required item, for any project that can emit a bundle. It knows nothing about Figma, Penpot or a component framework.

Status: the matrix (N2a) inside the release-first shell (v5 step 1). The designed release overview, the family gallery, the comparison view and the Changes screen are the next steps; see `PLAN.md`.

## Try it

```bash
pnpm install
pnpm --filter reflection-projection build      # the viewer reads the built package
pnpm --filter reflection-ui demo-bundles       # writes ./.demo-bundles (git-ignored)
pnpm --filter reflection-ui dev                # http://localhost:5173
```

`REFLECTION_BUNDLES_DIR=/path/to/bundles pnpm --filter reflection-ui dev` serves your own folder of bundles instead. Each subfolder with a `manifest.json` is one bundle. The dev server (and `vite preview`) lists them at `/bundles/index.json` and serves their files through the same directory reader the bundle tests use, so a path can never leave its bundle. This is local only; the deployed portal brings its own index.

The demo bundles are written from the projection package's fixtures, with generated placeholder images:

| Bundle | Shows |
| --- | --- |
| `marwes-button` | A large family: 273 required, 203 proven, 14 needs design, 56 not enrolled |
| `sourcer-login` | A provider with no "needs design" or "not enrolled" concept: those buckets read as unknown |
| `native-basic-react` | A native Reflection report: only what ran is listed, so the count is a lower bound |
| `docs-site` | A project unrelated to either, with a failure, two browsers and items that were never compared. The only demo with an (illustrative) delta, so the "Since" card shows |
| `docs-site-tampered-image` | One image no longer matches its hash: evidence invalid, that comparison counted as unknown |
| `docs-site-rejected` | A manifest edited after publishing: the bundle is refused |

## Navigation

One sidebar for every route in a release: the release picker (project, release, state, and a selector for the other bundles), Overview, Changes, one expandable Components list and one expandable Pages list (each with its own search), and Design references (disabled until it exists). The evidence state sits in the top bar on every route. Routes:

```text
#/                                              bundle list
#/bundles/:bundle                               release overview
#/bundles/:bundle/changes                       changes (not available yet)
#/bundles/:bundle/components/:subject           all required items for a component family
#/bundles/:bundle/pages/:subject                all required items for a page
#/bundles/:bundle/<section>/:subject/comparisons/:comparison   full comparison (?mode, ?zoom, ?checker, plus the filters it came from)
```

A subject opened under the wrong section is redirected to its own.

**The comparison view** shows one recorded comparison large: reference, implementation and the recorded diff side by side, or overlay (opacity, blink), wipe, or the diff alone, with zoom and a shared scroll. The rail has the recorded result, failing measurements first, the recorded diff metric and threshold, and any reference caution. Below are provenance, gaps (what was not proven, plus recorded limitations) and the same item in other implementations. Previous and next walk the subject in matrix order and follow the filters of the page the reader came from. Keys: `j` and `k` (or the arrows) move between comparisons, `1` to `4` switch the mode. If the two images differ in size, Fit is overridden to native size and a banner says so: nothing is scaled to hide it. Nothing in the view can change an outcome, and the threshold is shown, not adjustable.

**A subject** has views: the visual gallery (default), all required items, and Changes (disabled until it exists). For a component the gallery shows one required item: dimension selectors pick it (a change keeps that value and as many others as an existing item allows), then the reference and one card per chosen implementation, verification details and a light pairwise comparison. For a page it shows the recorded page checks, failed and unproven first, with a link to the full inventory. The item, the implementations and the filters are in the URL.

**The release overview** shows the release identity and every design source with its own date, the two summary panels, a "Needs attention" card derived from the recorded data (each item opens its subjects filtered to the right outcome group), a "Since <release>" card only when the bundle has a delta against a previous release, and one card per component or page with a single coverage line in required items. It shows no percentages and no comparison totals on cards.

## How it behaves

- **Counts come from one function** (`summarizeProjection` / `summarizeReadiness`). Required items and comparisons are shown as two groups with one unit each, never as one ratio. A bucket the provider has no concept of reads "unknown", never 0.
- **Outcome groups:** Failed, Not proven, Passed, Missing. Missing is collapsed with a count of reasons; a long Passed group starts collapsed. Collapsed rows still count.
- **Reference column** says what the shared reference is once, in its header (source and who approved it), and each row only says where it differs. An approval nobody confirmed (recorded by an agent, or lapsed) is shown in warning colour. A reference never shows a pass or fail.
- **Summary** is two panels of numbers, one unit each. The header shows where the proof came from (source and its date, the run, the evidence state) as labelled facts.
- **Evidence state:** a bundle has no live inputs to compare with, so a sound bundle reads "Offline bundle · freshness not verified". It never reads "Current". A bundle with a missing or tampered file reads "Evidence invalid": the affected comparisons lose their proof and count as unknown everywhere, and the inventory stays navigable. A bundle that cannot be trusted as a whole (changed manifest or projection, unsupported version) is refused, and the viewer does not fall back to another one.
- **Files are verified.** The bundle opens at once; in the background every file is read and hashed ("Verifying files…"), and each image is hash-checked before it is shown.
- **URLs carry the view:** search, outcome and dimension filters and density are in the address, so a link reproduces what you were looking at.

## Layout

```text
src/
  data/        bundle catalog (HTTP), queries, open-bundle context
  model/       pure view model: subjects, matrix, filters, bundle state, search (no React)
  components/  atoms, molecules, organisms
  routes/      pages, layout and path helpers
  theme/       tokens (rem spacing), global style, color scheme
scripts/       make-demo-bundles.ts
tests/         model tests and viewer tests that read real bundles written by the writer
```

## Known limits

- The bundle list reads each bundle's entry files only, so it does not show a tampered image; open the bundle to see that.
- The full background verification reads every file once. That is cheap locally and for demo bundles; a very large bundle may want lazy or opt-in verification.
- An item compared in only some implementations can read Proven; the gallery says which were not compared. Whether an implementation can be mandatory is an open decision (see `PLAN.md`).
- The matrix renders all rows of an open group without virtualization. Measure before adding it.
- Object URLs for loaded images are not revoked; fine for a viewing session.
- Summary-only (archived) releases and the release overview are not built yet.
