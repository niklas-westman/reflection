# Reflection plan (living document)

**This file is where we are.** Read it first in every session. It says what the product is, what is done, what is being worked on, what is next, and what is blocked or undecided. The long-form reasoning lives in the briefs; this file is the checklist.

Last updated: 2026-10-19 (v5 step 1 done)

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

- [ ] **v5 step 2: Release Overview** (see "Viewer" below). Not started. The overview route exists with a seed (release identity, the two summary panels, subject links); step 2 replaces it with the designed page.

## Next (in order)

1. v5 step 3: family and page overview (gallery plus all required items).
2. v5 step 4: comparison inspector.
3. v5 step 5: Changes screen (needs three decisions, see "Open questions").
4. v5 step 6: release and history picker, Design references, error states.

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
- [ ] **Subject catalog**: optional label, description and links per subject.
- [ ] **Source links**: provider-supplied http(s) URLs for "open in design source" and "open page source". Never a hardcoded tool name.
- [ ] **`diffProjections(previous, current)`**: pure; requirements added or removed, reference hash changed (= updated), regressed, fixed.
- [ ] Optional per-change note supplied by a provider.
- [ ] Approver-list configuration schema (N3).
- [ ] Discord message formatters for Approve and Require changes (N3).
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

**Step 2: Release Overview**
- [~] Release header with all source dates (not one), run, offline fact. Seeded in step 1 (every snapshot with its date and the run); not yet the designed header.
- [~] Required-items panel and comparisons panel, no percentages. Seeded in step 1; no percentages anywhere.
- [ ] "Needs attention" card derived from the data.
- [ ] Family and page cards: one coverage line each, no repeated comparison totals, change type separate from verification.
- [ ] "What changed" and "Designer review" cards only when a delta exists; derived counts, no process copy.

**Step 3: family and page overview**
- [ ] Dimension selectors that pick one required item (generic over subject dimensions).
- [ ] Reference card plus data-driven adapter cards (1, 2, 3 or N; no fabricated adapters; horizontal scroll beyond a minimum width).
- [ ] Verification details for the selected item (recorded threshold, viewports, last captured).
- [ ] Inline compare preview leading to the inspector.
- [ ] Page overview with recorded page checks and a stated selection rule (failed and not proven first, then a few, always "View all N").
- [ ] Views: Visual gallery, All required items, Changes.

**Step 4: comparison inspector**
- [ ] Full-width route with a stable URL; previous and next through the current filter.
- [ ] Modes: Side by side, Overlay (blink, opacity), Wipe, Diff; fit, zoom, checkerboard, download original.
- [ ] Synced zoom and pan; images are the largest element.
- [ ] Right rail: recorded result, validity, measurements failures first, "Not recorded" when absent.
- [ ] Provenance, Gaps, Related (confirmed or suggested, never confused).
- [ ] States: no diff recorded, mismatched dimensions, missing or unusable image, no reference.
- [ ] Keyboard: `j`/`k` or arrows, `1` to `4` for modes; visible focus.

**Step 5: Changes screen** (needs the three decisions in "Open questions")
- [ ] `diffProjections` and schema additions (area 2).
- [ ] Changes screen: Added, Updated, Removed, before and after reference images from the previous retained bundle, "no longer retained" when pruned.
- [ ] Baseline is the previous release only.

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
- [ ] **v5, "Before and After"**: proposed to mean the reference image from the previous retained bundle.
- [ ] **v5, "Compare against"**: proposed to offer only the previous release (retention keeps two).
- [ ] **v5, no percentages anywhere**: proposed.
- [ ] **Verification cost**: full background verification reads every file; is that acceptable for the largest Marwes bundles, or opt-in?

## Verification baseline (all passing on 2026-10-19)

```bash
pnpm typecheck && pnpm test && pnpm build      # engine: 436 tests in 41 files (about 100 s)
pnpm check:packages                            # projection (109 tests), then ui (57 tests, build)
pnpm --filter reflection-projection run schema # regenerate schema/projection.v1.schema.json; no drift expected
node dist/cli.js doctor --config examples/basic-react/reflection.config.ts
node dist/cli.js run --config examples/basic-react/reflection.config.ts --mode smoke   # ends fail by design (two intentional failing routes)
node dist/cli.js review --json
```

Try the viewer: `pnpm --filter reflection-projection build`, then `pnpm --filter reflection-ui demo-bundles` and `pnpm --filter reflection-ui dev`.

## Change log

- 2026-10-19: v5 step 1: release-first shell and routes (sidebar, release picker, evidence state on every route, overview and changes stubs, section routes). UI tests 41 to 57.
- 2026-10-19: plan created in the repository; v5 design set evaluated and added as the viewer's build order.
- 2026-10-18: design pass 1 on the viewer (`2272e6e`); viewer scaffold and matrix (`1dd64b6`); bundle layout, notes, archive summary and provider guide (`6a5a2de`); workspace and projection contract (`eb25770`); engine exports (`b9cc37c`); E0 engine additions (`dc3c987`).
