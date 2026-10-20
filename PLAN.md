# Reflection plan (living document)

**This file is where we are.** Read it first in every session. It says what the product is, what is done, what is being worked on, what is next, and what is blocked or undecided. The long-form reasoning lives in the briefs; this file is the checklist.

Last updated: 2026-10-19 (0.2.0 published, Sourcer round 2 passed; building the UX brief for 0.3.0)

## How to keep this alive

- **Check a box in the same change that finishes the work**, and add a line to the change log. A box is checked only when the step is built *and* verified (typecheck, tests, build, and a browser check for UI).
- **Exactly one item is "Now".** When it finishes, move the next item up. Do not start a second item without saying so here.
- **New work goes in the area it belongs to** as an unchecked box. If it does not fit, add an area. Never leave work only in a chat or a brief.
- **A decision goes in the decisions table** with its date, then the boxes it unblocks. An unresolved question goes in "Open questions" until it is answered.
- **Do not widen a box silently.** If a step turns out bigger, split it into sub-boxes.
- **Outward-facing steps need the owner's go-ahead first**: push, tag, publish, version bump, deploy, S3 or CloudFront changes, Discord posts, any write to Figma or Penpot, any Figma REST call, and any change in the Marwes or Sourcer repositories. Local commits of verified steps do not.

Legend: `[x]` done and verified, `[ ]` open, `[~]` partly done (the line says what is left), `[!]` blocked (the line says on what).

## Product in one paragraph

**Reflection** is a neutral evidence engine (`reflection-check`) plus a read-only viewer and a release portal, so a designer or developer can see what a UI release proves against its design, without reading JSON. Marwes (Figma, React/Vue/Svelte) and Sourcer (Penpot) are the first two providers. The engine stays neutral: no Figma, Penpot, framework or Discord knowledge in it, and no required-items declaration (providers own requirements).

Four surfaces on one codebase: **engine** (root `src/`), **projection** (neutral contract, bundles, `packages/projection`), **viewer** (`packages/ui`), **release portal** (hosting, decisions, notes; not started).

## Where the detail lives

| What | Where |
| --- | --- |
| This checklist | `PLAN.md` |
| Decisions, facts that bite, code map, guardrails, resume checklist, v5 evaluation | `REFLECTION-CONTINUATION-BRIEF.md` (local, untracked) |
| Release portal detail: delta, decisions, notes, retention, bundle contract | `REFLECTION-RELEASE-PORTAL-BRIEF.md` (local, untracked) |
| Viewer product, design rules, design-AI hand-over | `REFLECTION-CHECK-UI-BRIEF.md`, `REFLECTION-CHECK-UI-DESIGN-BRIEF.md`, `REFLECTION-UI-ITERATION-BRIEF.md` (local, untracked) |
| Accepted visual direction (five mocks and `context.md`) | v5 design assets, in the Eagle's Eye `design-assets/v5/` folder (local, outside the repo) |
| Provider guide | `packages/projection/docs/provider-guide.md` |
| Projection contract and bundles | `packages/projection/README.md` |
| Viewer: how to run, behaviour, limits | `packages/ui/README.md` |
| Engine configuration and upgrading | `docs/configuration.md`, `docs/upgrading.md` |
| Agent protocol for UI work | `AGENTS.md`, `docs/validation-process.md` |

The briefs are untracked because they hold local paths. If a brief and this file disagree about status, this file is right; if they disagree about a decision, the decisions table below is right.

---

## Now

- [ ] **Provider round: Marwes 1 and Sourcer 3, 0.4.0** (`marwes-feedback-01.md`, `sourcer-feedback-03.md`; scope accepted 2026-10-20).
  - [ ] Projection: `snapshot.supersededBy`; comparisons that read a superseded snapshot count as not proven (`supersededComparisonIds`, used by `summarizeProjection`); `bindingForComparisons` and `standingDeviations` for provider-imported `accept-deviation` decisions; tests; JSON Schema.
  - [ ] Guide: superseded sources, imported accepted deviations, absent (not `not-run`) layers that are not required, the `buildDecisionBinding(requirements, comparisons)` signature, `run.inputs` keys from the project root, one comparison per requirement and adapter when cases are shared, every item needs a value for a `columns` dimension.
  - [ ] Viewer, superseded: counted as not proven; a cell, row reason, needs-attention item and comparison banner say "superseded design source".
  - [ ] Viewer, accepted deviations: a neutral overview line, a marker on the gallery and table cells, and the decision (who, when, words, still holds or lapsed) on the comparison.
  - [ ] Viewer, smaller: delegated approvals counted by record ("1 record covers 573 comparisons", "bound to the reference set as a whole"); both hashes when `boundTo` differs from the source; long approval notes clamped on the comparison; a "(none)" choice for items without a dimension; a visible "no value" column and "No mobile variant required"; segmented controls wrap at 390px.
  - [ ] Gates (tests, `reflect`, `a11y`), then release 0.4.0 (owner publishes) and prompts for Marwes round 2 and Sourcer round 4.
  - [ ] Visual baselines: promote the differences from 0.3.0 and this round in one go, after the owner approves (dry run first).

## Next (in order)

1. Marwes round 2 and job 3 (re-pin the 17 families on the old Figma file, one at a time, owner approves promotions). Sourcer round 4 with the Login re-export (Changes view with every reference updated).
2. Viewer: the Penpot revision in the Freshness line (promised in `reflection-reply-to-note-01.md`).
3. The release portal: publish step and `index.json` (R3), release list and ping (R4), decisions and notes backend (R5, R5b), retention (R6). Each outward-facing step needs the owner's go-ahead.
4. Open viewer items: dark-theme baselines, Linux baselines and the gate in CI, a hands-on screen-reader pass by a person.

---

## Decisions

| Date | Decision | Unblocks |
| --- | --- | --- |
| 2026-10-18 | Reflection family, not a new product above Reflection. Engine stays neutral; providers own requirements | everything |
| 2026-10-18 | pnpm workspace monorepo: engine at the root, other packages under `packages/`; published separately | `packages/*` |
| 2026-10-18 | kebab-case for files, folders, ids and enum values; camelCase for JSON property names | naming |
| 2026-10-18 | Five signals never merged: proof, readiness, validity, reference approval, review | schema, UI |
| 2026-10-18 | Every number counts required items, computed in one place (`summarizeProjection`). A bucket a provider has no concept of is `null` (unknown), never 0 | UI counts |
| 2026-10-18 | Validity is computed on read. A sound bundle is "Offline bundle, freshness not verified", never "Current" | UI states |
| 2026-10-18 | Decisions: **Approve** or **Require changes** (message required), bound to content (verdicts, baseline hashes, capture policy hashes, required set). An identical rebuild carries the decision forward. One approver is enough, checked against the JWT `email` claim | R5 |
| 2026-10-18 | An undecided candidate becomes "Superseded by <version>" automatically | R4, R5 |
| 2026-10-18 | Retention: two bundles kept in full (current, previous released); older releases keep an archive summary | R6 |
| 2026-10-18 | Notes per family, optional item anchor, append-only, never change an outcome | R5b |
| 2026-10-18 | Design tools are read through MCP. No Figma REST without approval each time | R1 |
| 2026-10-18 | Sourcer's existing approval records import as "recorded by an agent" until a person confirms | R2b |
| 2026-10-18 | One `projection.json` per bundle rather than the split files in the portal brief | bundles |
| 2026-10-18 | A viewer "family" is `subject.id` | UI grouping |
| 2026-10-18 | Local commits of verified steps need no confirmation; briefs stay untracked | process |
| 2026-10-19 | On the Changes screen, Before and After are the **reference (design) image** from the previous bundle; "Updated" means the reference hash changed | step 5 |
| 2026-10-19 | The baseline for Changes is the **latest released version before this build**, recorded in the bundle (`release.previousRelease`) and fixed; no baseline picker | step 5 |
| 2026-10-19 | **No percentages anywhere** in the viewer; counts with their unit only | all screens |
| 2026-10-19 | An item is proven in all its **required implementations** only where the provider declares `requiredImplementations`; undeclared keeps the recorded-comparisons rule | readiness, viewer |
| 2026-10-19 | Publish and test on adapters, starting with Sourcer: the owner publishes (`docs/releasing.md`), the adapter session builds a provider and writes feedback, Reflection fixes and republishes, two or three rounds. `reflection-projection` is published under the unscoped name; `reflection-ui` stays a private app that adapters run from this repository | adapter trials |
| 2026-10-19 | The v5 design set is the accepted direction, not a literal spec; where a mock and `context.md` or the product rules disagree, the text and rules win | viewer |
| 2026-10-19 | An agent may record an approval or decision a person gave in conversation, as `attestation: 'delegated'` (`by` the person, `recordedBy` the agent, the person's words in the note). It counts as the person's and is shown as recorded by the agent. `agent` stays for records with no person behind them. Replaces the 2026-10-18 rule that only a person decides | approvals, R5 |
| 2026-10-19 | The release state reads "Release candidate", not "Candidate" (clashed with a Sourcer page name). Superseded the same day by "Unreleased" | viewer |
| 2026-10-19 | `run.inputs[]` gains `hashKind: 'composite'`: one provider-computed hash over a declared set of files | validity |
| 2026-10-19 | Sourcer's email states stay under the Login page, separated by the `surface` dimension. Structural proof waits until after round 2 | Sourcer |
| 2026-10-19 | Sourcer's delegated approvals (an agent's account of the owner's words) stay `delegated`; the overview shows a neutral line pointing to the notes until the owner re-confirms with the Approve button | approvals |
| 2026-10-19 | The release state `candidate` reads "Unreleased" (replaces "Release candidate", which claimed a stage) | viewer |
| 2026-10-19 | Narrow width (390px): checked in the gate and fixed where broken; a designed mobile layout is separate work | viewer |
| 2026-10-19 | Presentation is a provider hint (`subjects[].presentation`), never guessed from dimension names | gallery |
| 2026-10-20 | A provider may import `accept-deviation` decisions (a raised limit the owner accepted), as `delegated` or `human`; bound to content, so they lapse when the result changes; shown apart from proof | deviations |
| 2026-10-20 | A comparison that read a superseded design snapshot (`snapshot.supersededBy`) counts as not proven, never passed or failed | readiness |

Rules every screen follows: two units never one ratio (required items versus comparisons); unknown is not zero; a reference is never a result; invalid evidence shows unknown, not a result; no percentages that read as compliance; no green comfort while items are missing; status is glyph plus text plus colour; one banner at a time; read-only until the decisions work starts.

---

## Areas

### 1. Engine (`reflection-check`, root `src/`)

- [x] E0: `report.inputs[]` (hashed inputs), `report.meta`, `report.resultHash`, case `ref`, `environment.browser` in visual mode, whole-segment artifact join fix. Additive, report schema stays v2. (`dc3c987`)
- [x] Export `hashReportInputs` and `computeResultHash` from the package entry. (`b9cc37c`)
- [x] Docs for the additions in `docs/configuration.md` and `docs/upgrading.md`.
- [ ] Export `listCaseBaselineFiles` from the engine (only if a consumer needs it).
- [x] Released `reflection-check` 0.7.0 for E0 (2026-10-19): version bumped, upgrade notes, package and install smoke, input hashing moved after the setup hooks. Published by the owner and verified.
- [ ] Run ids have one-second resolution, so two runs into the same report directory within a second would collide. Rare; make ids unique when a provider runs several configs in parallel.
- [ ] Push the local commits. Needs go-ahead.

### 2. Projection contract (`packages/projection`, private `reflection-projection`)

- [x] R0: requirement, comparison, snapshot, run, decision, release and delta schemas; `deriveReadiness`, `summarizeReadiness`, `summarizeProjection`, `computeValidity`, `buildDecisionBinding`, `evaluateDecision`; native report provider. (`eb25770`)
- [x] Generated JSON Schema with a drift test, and fixtures for four shapes (native, Marwes Button, Sourcer Login, independent docs-site).
- [x] N0: provider guide. (`6a5a2de`)
- [ ] Keep the provider guide current whenever a schema addition below lands.
- [x] **Subject catalog**: optional label, description, link and change note per subject (`subjects[]`).
- [x] **Source links**: provider-supplied http(s) URLs (`subject.sourceUrl`, `snapshot.sourceUrl`). Never a hardcoded tool name.
- [x] **`diffProjections(previous, current)`**: pure; requirements added or removed, reference hash changed (= updated), regressed, fixed.
- [x] Optional per-change note supplied by a provider (`subjects[].changeNote`).
- [ ] Approver-list configuration schema (N3).
- [ ] Discord message formatters for Approve and Require changes (N3).
- [x] **Required implementations**: a requirement can name them (`requiredImplementations`); each must have a comparison and pass, a missing one leaves the item not proven, a failure still reads failing. Without it, only recorded comparisons count. Built 2026-10-19.
- [x] `reflection-projection` 0.2.0 published 2026-10-19 (`delegated`, `composite`).
- [x] `reflection-projection` 0.1.0 published 2026-10-19 under the unscoped name; public docs are project-neutral. `reflection-ui` stays a private app.

### 3. Bundles (`packages/projection`)

- [x] N1: manifest with per-file hashes and bundle hash; `openBundle` (rejected versus opened with problems), `verifyBundleFile`; Node writer and directory source (`reflection-projection/node`); hostile path, symlink, SVG/HTML and local-path/credential refusals. (`6a5a2de`)
- [x] Notes record schema with `foldNotes` and `countNotes`; archive summary schema with `buildArchiveSummary`.
- [x] File verification runs eight at a time.
- [ ] `index.json` (release list and state) and an explicit "latest" pointer. Part of R3.
- [ ] Decide where the archive summary is generated (before images are deleted).
- [ ] Lazy or opt-in verification for very large bundles in a browser.
- [ ] Optional derived files (split comparisons, delta) if the AI helper or lazy loading needs them.

### 4. Viewer (`packages/ui`, private `reflection-ui`)

Built so far:

- [x] N2a scaffold: React 19, Vite 7, styled-components, TanStack Router (hash history) and Query. (`1dd64b6`)
- [x] Bundle list, subject rail, matrix with outcome groups (Failed, Not proven, Passed, Missing), filters, density, URL state.
- [x] Designed states: invalid evidence, offline, rejected bundle, only-what-ran lower bound, empty filter.
- [x] Background file verification and per-image hash check.
- [x] Demo bundles script (six bundles, two deliberately broken) and 41 tests that read bundles written by the real writer.
- [x] Design pass 1: stat panels, labelled provenance, shared-reference header, group headers. (`2272e6e`)

**v5 design, in build order** (evaluated 2026-10-19; corrections and data additions in the continuation brief, section 14):

**Step 1: shell and routes** (done 2026-10-19)
- [x] Routes: bundle overview, `changes`, `components/:subject`, `pages/:subject`, comparison under each. A subject opened under the wrong section is redirected.
- [x] One persistent sidebar: Overview, Changes, one expandable Components, one expandable Pages (search inside each, only while open), Design references (disabled until step 6).
- [x] Release picker from the bundle list, above the navigation, visible on every route; the evidence state (offline, invalid, verifying) is in the top bar on every route.
- [x] Current subject page is the "All required items" view (the matrix).
- [x] Overview and Changes exist as honest stubs: the overview shows release identity, both summary panels and subject links; Changes says it is not available yet.
- [x] 57 tests, mutation-checked; browser check in light and dark; keyboard order top bar, sidebar, content.

**Step 2: Release Overview** (done 2026-10-19)
- [x] Release header: build, branch and commit when recorded, every design source with its own date, the run. The offline fact is in the top bar on every route.
- [x] Required-items panel and comparisons panel with a scope bar; no percentages anywhere (tested).
- [x] "Needs attention" card derived from recorded data: failures (in comparisons), unusable evidence, needs design, not enrolled, not proven, reference approvals not confirmed by a person. Each item names its subjects and opens them filtered to the right outcome group. A count a provider has no concept of is left out, never zero.
- [x] Component and page cards: one coverage line in required items (proven of required, failing, unresolved, breakdown, bar); no comparison totals; ordered failing first; first twelve with "View all N".
- [x] "What changed" card only when a delta against a previous release exists (regressed, fixed, still failing, newly enrolled, new and removed in the design source, same or newer snapshot); absent for no delta and for a first release.
- [x] "Designer review" card dropped: it was process copy, and the data it would need (changed references) does not exist until `diffProjections`.
- [x] 73 tests, mutation-checked; browser check light and dark; demo `docs-site` bundle carries an illustrative delta.

**Step 3: family and page overview** (done 2026-10-19)
- [x] Dimension selectors that pick one required item, generic over subject dimensions; a change keeps that value and as many others as an existing item allows, so the view always shows a real item. A direct "Required item" picker too.
- [x] Reference card plus one card per chosen implementation, from the data: 1, 2, 3 or N, no invented cards, never narrower than a readable preview (the row scrolls sideways). An implementation with no comparison shows "Not compared".
- [x] Implementation chooser (never fewer than one); item and implementations are in the URL.
- [x] Verification details: status, viewports, recorded threshold (a fact, not a control), run and reference dates, the item's own comparison count, required proofs by implementation, and which implementations were not compared.
- [x] Inline comparison: reference against one implementation, side by side or overlay with an opacity control; leads to the full comparison.
- [x] Page overview: recorded page checks with a stated selection rule (a check needs a recorded comparison; failed and not proven first; at least three, at most six; "View all N required items"); each implementation's result shown separately; one banner when reference approvals are not confirmed by a person.
- [x] Views: Visual gallery, All required items; Changes is disabled until step 5. Attention links open the inventory already filtered.
- [x] 119 tests, mutation-checked; browser check with interaction (dimension change, implementation toggle, open comparison) in light and dark, no console errors.

**Step 4: comparison inspector** (done 2026-10-19)
- [x] Full-width route with a stable URL; previous and next walk the comparisons of the subject in matrix order (failures first). They follow the filters of the page the reader came from, and a page filtered to failures walks only the failed comparisons. Filters and view state travel in every link.
- [x] Modes: Side by side (reference, implementation and the recorded diff at once), Overlay (opacity, blink), Wipe (slider), Diff; zoom Fit, 100, 200, 400; checkerboard; download of each original that verifies. Mode, zoom and checkerboard are in the URL.
- [x] Shared scroll across the side-by-side panels; images are the largest element, the rail is 17.5rem and stacks below 1100px.
- [x] Right rail: result as recorded (offline: freshness cannot be rechecked), failing measurements first with one plain sentence from the recorded values, passing ones folded, recorded diff metric and threshold as facts (no control), "Not recorded" when absent, reference provenance caution.
- [x] Provenance (run, runner, design source, file hashes, baseline, capture policy, source nodes, bundle), Gaps (what was not proven, plus recorded limitations), Related (the same item in other implementations).
- [x] States: no diff recorded, no reference, unusable image, overlay and wipe needing both images, mismatched dimensions (Fit is overridden to native size and the banner says nothing was scaled to hide it).
- [x] Keyboard: `j`/`k` or arrows between comparisons, `1` to `4` for modes, never while typing in a control; visible focus; blinking off under reduced motion.
- [x] 163 tests (29 inspector UI, 16 inspector model), mutation-checked; browser check with real images (modes by key, zoom, synced scroll, next by key, reduced motion, dark), no console errors; the `docs-site` demo carries an illustrative diff, measurements and a size mismatch.
- [ ] Not built: a `Related` list distinguishing confirmed from suggested design mappings (no such data exists yet); a legend for ignored regions and antialiasing (not in the schema); previous failure / next failure as separate controls.

**Step 5: Changes screen** (done 2026-10-19; decisions: reference image, previous release only, no percentages)
- [x] `diffProjections(previous, current)` in the projection package: subjects and required items added, removed or updated (a reference is updated only when both releases hashed it and the hashes differ, or one had a reference and the other none), plus regressed, fixed, still failing and newly enrolled comparisons. Pure, deterministic, from recorded data only.
- [x] Subject catalog (`subjects[]`: label, description, sourceUrl, changeNote) and `snapshot.sourceUrl`, http(s) only, all optional; used for labels, descriptions, the design-source link and the provider's change note. `comparisonOutcome` moved into the projection package.
- [x] Changes screen: summary in required items (added, updated, removed) with subject counts, filter by kind, search, a card per changed subject with the reference before and after, the changed items, and the provider's change note. A removed subject has no link. "Image no longer retained" when a previous image is gone.
- [x] Baseline is the previous release named in the manifest (released over candidate, later build over earlier). When it is not available the page says so and still shows the stored delta; a first release says there is nothing to compare with.
- [x] Per-subject change badge on the overview cards (apart from verification) and a "Design changes since" card replacing the dropped "Designer review" card; the subject Changes view lists the changed items with before and after.
- [x] 189 viewer tests and 130 projection tests, mutation-checked; browser check of the changes page, overview badges, the subject Changes view and a pruned image (the one 404 in the console was that deliberate removal). The demo set has a `docs-site-previous` release.
- [ ] Not built: the overview "Designer review" wording from v5 stays dropped; a change filter by item inside a subject; a link from a Changes card to its filtered inventory.

**Step 6: the rest** (done 2026-10-19)
- [x] Release and history picker: project and release as two choices from every release the viewer knows; a release that can be opened in full is a bundle, one that left its slot is a summary labelled "summary only"; identical labels are told apart by bundle id. The bundle list page also lists earlier releases (summary only) and says how many archive entries could not be read.
- [x] Summary-only page for an archived release: an information bar (evidence removed on a date, with the reason, "not evidence"), required items in one unit with unknown kept unknown, the decision as it stood at exit and whether it still matched, design sources with their own dates, change since the previous release, notes at exit. No images, comparisons or percentages. The changes page links to it when the previous release exists only as a summary.
- [x] Design references page: each recorded source with its own date, kind, file keys, hash, link and what reads it; reference approvals counted by who recorded them (person, agent, lapsed, none, no reference).
- [x] States: never run (banner and pill), stale (banner with the changed inputs; reachable only when a runner supplies current inputs), files not fully verified (defensive; `openBundle` itself never throws), a bundle with no required items and no comparisons, and the one-banner priority (invalid, never run, stale, verification, only-what-ran, unconfirmed references).
- [x] The catalog gained `archive()`; the dev server lists `archive/*.json` in `index.json`; summaries are validated and unreadable ones counted.
- [x] A latent bug fixed: dates are formatted with fixed month names ("Sep", not the platform's "Sept").
- [x] 228 viewer tests, mutation-checked; browser check of the picker, a summary page (light and dark), the bundle list and the design references page. The demo set has two archive summaries.
- [ ] Not applicable: "runner unavailable" (the viewer has no run control, so there is nothing to disable).

Viewer quality:
- [x] Reflection smoke over the viewer's routes against the demo bundles (dogfooding): `packages/ui/reflection.config.ts`, 11 routes in two desktop widths (1440 and 1100), expecting a heading, no console error, no sideways page scroll, with a screenshot each; `pnpm --filter reflection-ui reflect`. The first run found two real gaps (no visible "Recorded page checks" and "Changes to inspect" headings), now fixed.
- [x] The page-level overflow check cannot see sideways overflow inside the content pane (a 3000px mutation passed it). The visual baselines close that gap: the same mutation now produces a review item.
- [x] Visual baselines for 14 stable routes (`visualSmoke`), approved by the owner on 2026-10-19: lossless WebP, 568 KB, in `packages/ui/tests/visual-baselines`, named `chromium-darwin` because they were made on macOS. Run-to-run noise on that machine is 0 pixels, so the threshold is `maxDiffPixels: 50` (a ratio would hide real changes in a mostly empty screen). Mutations (a 3000px table, a changed colour) are caught. A difference is review-only.
- [ ] Linux baselines for CI: a run on another platform finds no baseline and reports a review item. Make them on Linux (a container) and approve them the same way.
- [ ] Run the gate in CI (the generated demo bundles, a Vite dev server and Linux baselines are the needs).
- [x] Keyboard, focus and screen-reader pass, done with an automated audit (`pnpm --filter reflection-ui a11y`): axe-core's WCAG A and AA rules on 11 routes in light and dark and on five open-menu and inspector-mode states, plus a keyboard walk that checks every stop has a name and a visible focus ring, and that every page has its own title. The first run found: decorative status shapes exposed as unnamed images, a label that did not contain its visible text, bare buttons with unreadable dark-theme contrast, and no page titles. All fixed. Also added: a title per page, focus moves to the page content after navigation (not on a filter or mode change), counts and the comparison position are announced, labelled containers have a group role. 238 viewer tests cover these.
- [ ] A hands-on screen-reader pass (VoiceOver or NVDA) by a person: the audit finds structural problems, not whether the experience reads well.
- [ ] A designed mobile layout (390px works, but is a stacked desktop layout).
- [ ] Virtualization, only if measured as needed.
- [x] Dark-theme parity: every route also runs in the dark theme in the gate (heading, no console error, no sideways scroll) and in the audit (contrast), with zero findings.
- [ ] Dark-theme visual baselines. They would be a second set of baselines for the owner to approve.
- [ ] Release the viewer as an installable package or static build (decision below).

### 5. Providers (other repositories; each needs the owner's go-ahead and a session there)

**Marwes (Figma)**
- [ ] R1: `.figma` upgrade: snapshot archive, node classification, stable keys, net diff, read-only MCP tools, two-tier source currency.
- [ ] Confirm node identity survives the per-snapshot Figma copy (name and type, not only the id).
- [ ] R2: emit a projection: separated signals (never forward `blocked`), per-family provenance, archive copy of the manifest and inventory at release time, delta, bundle written with `writeBundle`.
- [ ] Declare `requiredImplementations` (react, vue, svelte) on each requirement, if those are the fixed set.
- [ ] Run the provider checklist (builds twice identical; `openBundle` returns opened with no problems).

**Adapter trials** (decided 2026-10-19: publish, try on one adapter, collect feedback, fix, repeat two or three times; Sourcer first, Marwes next). Feedback lives in the Eagle's Eye handoff folder `handoff/reflection-feedback/` (brief, template, one feedback file per round).
- [x] Published 2026-10-19: `reflection-check` 0.7.0 and `reflection-projection` 0.1.0. Verified by installing both into an empty folder and running a provider flow (write a bundle, open it, count it).
- [x] Sourcer round 1: the Sourcer session built the Login provider (30 required, 30 proven, counts match Sourcer's own; identical decision binding across two builds) and wrote `sourcer-feedback-01.md`.
- [x] Reflection session read round 1, fixed the toolkit and viewer, published `reflection-projection` 0.2.0 (2026-10-19, verified from the registry).
- [x] Sourcer round 2 on 0.2.0: all eight round 1 items fixed; counts 30 / 30; `delegated` and `composite` fit (`sourcer-feedback-02.md`), plus a UX brief.
- [x] Sourcer UX brief built and released as `reflection-projection` 0.3.0 (2026-10-19).
- [x] Sourcer round 3 on 0.3.0: all ten UX findings done, counts 30 / 30 (`sourcer-feedback-03.md`); five Login states are emails, not eight.
- [x] Marwes round 1 on `reflection-check` 0.7.0 and `reflection-projection` 0.3.0: Button counts match (273 / 203 / 0 / 14 / 56), 0 verdict changes from the engine upgrade (`marwes-feedback-01.md`).
- [ ] Marwes round 2 and Sourcer round 4 on 0.4.0.
- [ ] Marwes round 1, with what Sourcer taught us.

**Sourcer (Penpot)**
- [ ] Read the Sourcer integration note in the Eagle's Eye handoff first.
- [ ] R2b step 1: Login as a page with 30 requirements; approvals import as agent-recorded; hashes added at ingest.
- [ ] Pin the Penpot revision for source currency.
- [ ] Move Sourcer's page verify onto `reflection-check` with case `ref`.
- [ ] Move approvals to human decisions.

### 6. Release portal

- [ ] R3: publish step (S3 plus CloudFront), `index.json`, "Build failed" row, explicit pipeline step only. Needs go-ahead.
- [ ] R4: release list and the candidate-published ping (Discord or email). Needs go-ahead.
- [ ] R5: decisions backend: Lambda, DynamoDB, JWT verification, approver list, CSRF, one Discord post per decision.
- [ ] R5b: notes API and UI.
- [ ] Decision UI: a clear Approve button, Require changes, carried-forward display (`evaluateDecision` already exists). Agents may also record a person's decision given in chat, as `delegated`.
- [ ] R6: retention: two slots, archive summary on exit, content-addressed GC, dry-run pruning with an audit entry.
- [ ] R7: AI analysis artifact: structured inputs only, labelled, never changes an outcome.

### 7. Process and housekeeping

- [x] Local commits for E0, workspace, R0, N0/N1, N2a and the design pass.
- [x] This plan in the repository and pointed to from `AGENTS.md`.
- [ ] Decide whether and where the private briefs and mockup live long term.
- [ ] Package scripts and CI for the workspace (`check:packages` exists locally; no CI wiring yet).
- [x] AGENTS.md gate also run against the viewer (documented in `AGENTS.md`).

---

## Open questions

- [ ] **Approver list**: who is on it, and does it live in configuration or the registry repository?
- [ ] **A failed build** (a pipeline run with no valid bundle): proposal is a "Build failed" row with the reason and a log link; never a candidate, no decision, takes no slot.
- [ ] **Node ids across the Figma copy**: does identity survive?
- [ ] **JWT and CloudFront**: issuer, audience, algorithm, key source, cookie flags; can `/api/*` forward the identity cookie on the portal's host?
- [ ] **Archive summary**: where is it generated?
- [ ] **Penpot backend RPC**: does it work headless, for source currency in CI?
- [ ] **Sourcer v1**: does it keep the Figma path (Reflection 0.3.0, MCP, n8n)?
- [ ] **Publishing**: when to bump and publish `reflection-check`; package names and npm scope; push.
- [x] **v5, "Before and After"**: the reference image from the previous bundle. Decided 2026-10-19.
- [x] **v5, "Compare against"**: the latest released version before this build, fixed, no picker. Decided 2026-10-19.
- [x] **v5, no percentages anywhere**. Decided 2026-10-19.
- [x] **Mandatory implementations**: decided 2026-10-19 as an optional provider-declared list per requirement; the rule applies only where declared.
- [ ] **Verification cost**: full background verification reads every file; is that acceptable for the largest Marwes bundles, or opt-in?

## Verification baseline (all passing on 2026-10-19)

```bash
pnpm typecheck && pnpm test && pnpm build      # engine: 436 tests in 41 files (about 100 s)
pnpm check:packages                            # projection (142 tests), then ui (247 tests, build)
pnpm --filter reflection-projection run schema # regenerate schema/projection.v1.schema.json; no drift expected
node dist/cli.js doctor --config examples/basic-react/reflection.config.ts
node dist/cli.js run --config examples/basic-react/reflection.config.ts --mode smoke   # ends fail by design (two intentional failing routes)
node dist/cli.js review --json
```

Try the viewer: `pnpm --filter reflection-projection build`, then `pnpm --filter reflection-ui demo-bundles` and `pnpm --filter reflection-ui dev`.

## Change log

- 2026-10-20: `reflection-projection` 0.3.0 published; Sourcer round 3 and Marwes round 1 read; 0.4.0 scoped.
- 2026-10-19: UX brief built for 0.3.0: metric meaning and presentation hint in the projection; delegated-approval note, trust-ordered approvals and per-row approval; comparison page led by the images (437px panes at 1400px, Difference large, navigation toggle); grouped page gallery; one Freshness group; Unreleased; phone width without sideways scroll, in the gate. Projection tests 142 to 145, UI tests 248 to 259.
- 2026-10-19: `reflection-projection` 0.2.0 published; Sourcer round 2 passed; UX brief scoped for 0.3.0.
- 2026-10-19: round 1 fixes built: `delegated` attestation and `composite` inputs in the projection, guide updated, viewer shows approval details, native values, "Release candidate", run age, the metric by name, and drops gaps a provider never had; tall thumbnails fit. Projection tests 139 to 142, UI tests 238 to 247.
- 2026-10-19: Sourcer round 1 feedback read; fixes proposed and accepted; decisions on `delegated` attestation, "Release candidate", composite inputs, email states.
- 2026-10-19: `reflection-check` 0.7.0 and `reflection-projection` 0.1.0 published and verified from the registry.
- 2026-10-19: pushed `main`; prepared `reflection-check` 0.7.0 and `reflection-projection` 0.1.0 for the owner to publish; added `docs/releasing.md`; brief for the Sourcer adapter trial.
- 2026-10-19: accessibility pass: audit script, fixes (decorative glyphs, label, button contrast, page titles, focus after navigation, live regions, group roles), dark variants of every route in the gate; the two comparison baselines were updated for the new breadcrumb (intended, approved). UI tests 228 to 238.
- 2026-10-19: visual baselines for the viewer (14 routes, approved by the owner); threshold `maxDiffPixels: 50`; the overflow gap is closed by the baselines.
- 2026-10-19: proved the viewer gate with two mutations: a console error is caught on both widths; sideways overflow inside the content pane is not (recorded as a gap).
- 2026-10-19: dogfooding: Reflection smoke gate on the viewer (`packages/ui/reflection.config.ts`, `pnpm --filter reflection-ui reflect`); visible headings added to the page checks and the changes list; AGENTS.md documents the viewer gate.
- 2026-10-19: v5 step 6: release and history picker, summary-only release page, design references page, never-run, stale and verification states, empty-bundle state; fixed month names in dates. UI tests 200 to 228. The v5 design is fully built.
- 2026-10-19: required implementations: `requiredImplementations` on a requirement, `missingImplementations`, the readiness rule, columns and cards for implementations nobody compared, a needs-attention item, inspector gaps, a `docs-site-strict` demo. Projection tests 130 to 139, UI tests 189 to 200.
- 2026-10-19: v5 step 5: `diffProjections`, subject catalog and source links in the projection; Changes screen, overview badges and design-changes card, per-subject Changes view in the viewer. Projection tests 109 to 130, UI tests 163 to 189.
- 2026-10-19: v5 step 4: comparison inspector (three-up and single-stage modes, zoom with synced scroll, measurements rail, provenance, gaps, related, honest states, keyboard). UI tests 119 to 163.
- 2026-10-19: v5 step 3: component gallery (dimension selectors, reference and implementation cards, verification details, inline compare), page overview with recorded checks, view switcher, subject banner for unconfirmed reference approvals. UI tests 73 to 119.
- 2026-10-19: v5 step 2: designed Release Overview (header facts, panels, needs-attention and changes-since cards, subject cards with view-all). UI tests 57 to 73.
- 2026-10-19: v5 step 1: release-first shell and routes (sidebar, release picker, evidence state on every route, overview and changes stubs, section routes). UI tests 41 to 57.
- 2026-10-19: plan created in the repository; v5 design set evaluated and added as the viewer's build order.
- 2026-10-18: design pass 1 on the viewer (`2272e6e`); viewer scaffold and matrix (`1dd64b6`); bundle layout, notes, archive summary and provider guide (`6a5a2de`); workspace and projection contract (`eb25770`); engine exports (`b9cc37c`); E0 engine additions (`dc3c987`).
