# Reflection plan (living document)

**This file is where we are.** Read it first in every session. It says what the product is, what is done, what is being worked on, what is next, and what is blocked or undecided. The long-form reasoning lives in the briefs; this file is the checklist.

Last updated: 2026-10-19 (v5 steps 1 to 5 done)

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

- [ ] **v5 step 6: release and history picker, Design references page, remaining error states** (see "Viewer" below). Not started.

## Next (in order)

1. Decide how a missing implementation counts toward Proven (required implementations), then build it.
2. Viewer quality: dogfood Reflection on the viewer, keyboard and screen-reader pass, dark parity.

Providers and the release portal follow once the viewer can open a real bundle. They need the owner's go-ahead and sessions in other repositories.

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
| 2026-10-19 | The v5 design set is the accepted direction, not a literal spec; where a mock and `context.md` or the product rules disagree, the text and rules win | viewer |

Rules every screen follows: two units never one ratio (required items versus comparisons); unknown is not zero; a reference is never a result; invalid evidence shows unknown, not a result; no percentages that read as compliance; no green comfort while items are missing; status is glyph plus text plus colour; one banner at a time; read-only until the decisions work starts.

---

## Areas

### 1. Engine (`reflection-check`, root `src/`)

- [x] E0: `report.inputs[]` (hashed inputs), `report.meta`, `report.resultHash`, case `ref`, `environment.browser` in visual mode, whole-segment artifact join fix. Additive, report schema stays v2. (`dc3c987`)
- [x] Export `hashReportInputs` and `computeResultHash` from the package entry. (`b9cc37c`)
- [x] Docs for the additions in `docs/configuration.md` and `docs/upgrading.md`.
- [ ] Export `listCaseBaselineFiles` from the engine (only if a consumer needs it).
- [ ] Release `reflection-check` as a minor version for E0 (bump, changelog, publish). Needs go-ahead.
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
- [ ] Decide whether a requirement can declare **required implementations**. Today only recorded comparisons count, so an item compared in one of three implementations can read Proven (the gallery says "Not compared in: ..." beside it). The v5 text says a missing mandatory implementation must block Proven.
- [ ] Decide the package names and npm scope for `reflection-projection` and `reflection-ui`.

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

**Step 6: the rest**
- [ ] Release and history picker: current, previous, and archive summaries (summary-only view).
- [ ] Design references page (the snapshots list).
- [ ] Remaining error states: stale, runner unavailable, never run, partial data, no results.

Viewer quality:
- [ ] Reflection visual smoke over the viewer's routes against the demo bundles (dogfooding).
- [ ] Keyboard, focus and screen-reader pass.
- [ ] Virtualization, only if measured as needed.
- [ ] Dark theme parity for every screen.
- [ ] Release the viewer as an installable package or static build (decision below).

### 5. Providers (other repositories; each needs the owner's go-ahead and a session there)

**Marwes (Figma)**
- [ ] R1: `.figma` upgrade: snapshot archive, node classification, stable keys, net diff, read-only MCP tools, two-tier source currency.
- [ ] Confirm node identity survives the per-snapshot Figma copy (name and type, not only the id).
- [ ] R2: emit a projection: separated signals (never forward `blocked`), per-family provenance, archive copy of the manifest and inventory at release time, delta, bundle written with `writeBundle`.
- [ ] Run the provider checklist (builds twice identical; `openBundle` returns opened with no problems).

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
- [ ] Decision UI: Approve, Require changes, carried-forward display (`evaluateDecision` already exists).
- [ ] R6: retention: two slots, archive summary on exit, content-addressed GC, dry-run pruning with an audit entry.
- [ ] R7: AI analysis artifact: structured inputs only, labelled, never changes an outcome.

### 7. Process and housekeeping

- [x] Local commits for E0, workspace, R0, N0/N1, N2a and the design pass.
- [x] This plan in the repository and pointed to from `AGENTS.md`.
- [ ] Decide whether and where the private briefs and mockup live long term.
- [ ] Package scripts and CI for the workspace (`check:packages` exists locally; no CI wiring yet).
- [ ] AGENTS.md gate also run against the viewer once it is dogfooded.

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
- [ ] **Mandatory implementations**: should an item compared in only some implementations be Proven? (Needs a provider rule or a field on the requirement.)
- [ ] **Verification cost**: full background verification reads every file; is that acceptable for the largest Marwes bundles, or opt-in?

## Verification baseline (all passing on 2026-10-19)

```bash
pnpm typecheck && pnpm test && pnpm build      # engine: 436 tests in 41 files (about 100 s)
pnpm check:packages                            # projection (130 tests), then ui (189 tests, build)
pnpm --filter reflection-projection run schema # regenerate schema/projection.v1.schema.json; no drift expected
node dist/cli.js doctor --config examples/basic-react/reflection.config.ts
node dist/cli.js run --config examples/basic-react/reflection.config.ts --mode smoke   # ends fail by design (two intentional failing routes)
node dist/cli.js review --json
```

Try the viewer: `pnpm --filter reflection-projection build`, then `pnpm --filter reflection-ui demo-bundles` and `pnpm --filter reflection-ui dev`.

## Change log

- 2026-10-19: v5 step 5: `diffProjections`, subject catalog and source links in the projection; Changes screen, overview badges and design-changes card, per-subject Changes view in the viewer. Projection tests 109 to 130, UI tests 163 to 189.
- 2026-10-19: v5 step 4: comparison inspector (three-up and single-stage modes, zoom with synced scroll, measurements rail, provenance, gaps, related, honest states, keyboard). UI tests 119 to 163.
- 2026-10-19: v5 step 3: component gallery (dimension selectors, reference and implementation cards, verification details, inline compare), page overview with recorded checks, view switcher, subject banner for unconfirmed reference approvals. UI tests 73 to 119.
- 2026-10-19: v5 step 2: designed Release Overview (header facts, panels, needs-attention and changes-since cards, subject cards with view-all). UI tests 57 to 73.
- 2026-10-19: v5 step 1: release-first shell and routes (sidebar, release picker, evidence state on every route, overview and changes stubs, section routes). UI tests 41 to 57.
- 2026-10-19: plan created in the repository; v5 design set evaluated and added as the viewer's build order.
- 2026-10-18: design pass 1 on the viewer (`2272e6e`); viewer scaffold and matrix (`1dd64b6`); bundle layout, notes, archive summary and provider guide (`6a5a2de`); workspace and projection contract (`eb25770`); engine exports (`b9cc37c`); E0 engine additions (`dc3c987`).
