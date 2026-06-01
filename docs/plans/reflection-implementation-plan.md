# Reflection Implementation Plan

> **For Hermes:** Use this as the working implementation guide. Keep Day 1 focused on the smallest useful rendered-evidence loop before expanding into visual baselines, design contracts, Storybook, or Figma parity.

**Goal:** Build Reflection as a separate sibling repo: a small CLI that produces evidence-backed validation of rendered UI behavior, screenshots, reports, and CI decisions.

**Product stance:** Reflection should not use Greenhouse in the public package, binary, repo, config helper, or user-facing language. It may later integrate with external spec systems through adapters, but the product identity is standalone: `reflection`.

**Architecture:** Start with a TypeScript CLI around a narrow core: config loading, run planning, browser route execution, artifact writing, report generation, and exit-code classification. Add visual baselines, design command wrapping, and Storybook/Figma parity only after the browser evidence loop is working and verified.

**Tech stack:** TypeScript, Node >=22, pnpm, Commander, Zod, Vitest, Playwright, later `pngjs` + `pixelmatch` for image diffs.

---

## Product principles to preserve

1. **Small surface, deep evidence.** The user sees `reflection run`, `reflection review`, `reflection update`, and `reflection doctor`; implementation depth stays underneath.
2. **Rendered evidence beats claims.** A successful run must produce real browser evidence, machine-readable results, and human-readable summaries.
3. **No magic healing.** Reflection must never silently update baselines, raise thresholds, ignore environment mismatches, or mask dynamic content without explicit config.
4. **Sensitive by default.** Screenshots, traces, logs, cookies, and network data can leak private information. Traces and verbose network logs stay off unless explicitly configured or needed on failure.
5. **Review-only visual first.** Visual diffs start as review items unless a specific stable case is explicitly configured as blocking or strict mode is requested.
6. **Adapters, not coupling.** Future spec-system integration should compile external route/component/design metadata into Reflection targets. Reflection should not require a specific upstream spec product.
7. **Agents are first-class consumers.** `report.json` and `--json` output must make the next action clear: fix code, inspect artifact, update baseline, or ask a human.

---

## Current repository setup

Target path:

```text
/opt/data/workspace/repos/reflection
```

Initial package identity:

```json
{
  "name": "reflection",
  "private": true,
  "bin": {
    "reflection": "./dist/cli.js"
  }
}
```

Do not use scoped or product names containing `greenhouse` during this iteration.

---

## Planned repository shape

```text
reflection/
  README.md
  package.json
  tsconfig.json
  vitest.config.ts
  docs/
    plans/
      reflection-implementation-plan.md
  src/
    cli.ts
    commands/
      run.ts
      review.ts
      update.ts
      doctor.ts
      gc.ts
    core/
      config.ts
      define-reflection.ts
      run-planner.ts
      environment.ts
      artifact-store.ts
      manifest.ts
      report-schema.ts
      report-writer.ts
      baseline-store.ts
      failure-classifier.ts
      exit-codes.ts
    contracts/
      browser/
        browser-contract.ts
        route-runner.ts
        assertions.ts
        console-observer.ts
        overflow-check.ts
        fixtures.ts
      visual/
        visual-contract.ts
        image-diff.ts
        baseline-compare.ts
        masks.ts
      design/
        design-contract.ts
        command-adapter.ts
    integrations/
      playwright/
        browser-manager.ts
        context-factory.ts
        trace-policy.ts
      storybook/
        story-url.ts
        index-json.ts
    utils/
      fs-safe.ts
      hashing.ts
      logger.ts
      time.ts
  examples/
    basic-react/
      package.json
      src/
      reflection.config.ts
  tests/
    unit/
    integration/
    e2e/
```

Only create files as needed. The shape above is the intended destination, not permission to scaffold empty abstractions.

---

## Day 1: Browser evidence loop

### Day 1 goal

`reflection run` validates at least one route in a real browser, captures screenshot evidence, writes report artifacts, and exits with the correct status.

### Day 1 non-goals

- No Figma API.
- No Storybook integration.
- No design-token validator wrapping.
- No baseline updates.
- No full HTML report viewer.
- No broad framework auto-detection.
- No public publishing setup.

### Phase 1.1 — CLI and config foundation

**Objective:** Make the CLI parse flags, load config, validate schema, and fail clearly.

**Files:**
- Modify: `src/cli.ts`
- Create: `src/commands/run.ts`
- Create: `src/commands/doctor.ts`
- Create: `src/core/config.ts`
- Create: `src/core/define-reflection.ts`
- Create: `src/core/exit-codes.ts`
- Test: `tests/unit/config.test.ts`
- Test: `tests/unit/cli.test.ts`

**Required behavior:**

```bash
reflection run --config examples/basic-react/reflection.config.ts
reflection run --mode smoke
reflection run --ci
reflection doctor
```

Config helper:

```ts
import { defineReflection } from 'reflection';

export default defineReflection({
  project: 'basic-react',
  run: {
    defaultMode: 'smoke',
    ciMode: 'smoke'
  },
  contracts: {
    browser: {
      enabled: true,
      blocking: true,
      baseUrl: 'http://127.0.0.1:5173',
      routes: []
    }
  }
});
```

**Acceptance:**

- Missing config exits `2` with a useful message.
- Invalid CLI usage exits `64`.
- Valid minimal config loads and normalizes defaults.
- No user-facing package/config helper names contain `greenhouse`.

**Phase 1.1 evidence — 2026-05-31:**

- RED: `corepack pnpm exec vitest run tests/unit/config.test.ts tests/unit/cli.test.ts` failed because `src/core/config.ts`, `src/core/define-reflection.ts`, `src/core/exit-codes.ts`, and `createCli` did not exist yet; after first implementation pass it also exposed CLI error-handling issues for invalid mode and missing config.
- GREEN: Added config schema/default normalization, `defineReflection`, exit-code constants, command modules, and import-safe `createCli`.
- Verification: `corepack pnpm typecheck`, `corepack pnpm test`, `corepack pnpm build`, `node dist/cli.js run --mode smoke`, `node dist/cli.js doctor`, and `git diff --check` all passed.
- Current scope note: TypeScript config files are planned, but Phase 1.1 only proves runtime loading for JavaScript ESM config modules. True `reflection.config.ts` loading should be implemented deliberately when choosing the runtime loader strategy.

### Phase 1.2 — Artifact and report core

**Objective:** Every run writes a manifest and canonical reports before browser complexity expands.

**Files:**
- Create: `src/core/artifact-store.ts`
- Create: `src/core/manifest.ts`
- Create: `src/core/report-schema.ts`
- Create: `src/core/report-writer.ts`
- Create: `src/core/failure-classifier.ts`
- Test: `tests/unit/report-schema.test.ts`
- Test: `tests/unit/artifact-store.test.ts`

**Artifact layout:**

```text
.reflection/
  runs/
    <run-id>/
      manifest.json
      report.json
      report.md
```

**Canonical result model:**

```ts
type CheckResult = {
  id: string;
  suite: 'design' | 'browser' | 'visual' | 'component' | 'environment';
  target: string;
  status: 'pass' | 'fail' | 'warn' | 'skipped' | 'error';
  severity: 'blocking' | 'review' | 'info';
  summary: string;
  details?: string;
  artifacts: ArtifactRef[];
  metadata: Record<string, unknown>;
  suggestedNextStep?: string;
};
```

**Acceptance:**

- Dummy pass/fail checks produce valid `report.json` and readable `report.md`.
- Global run status is derived from check status/severity.
- `pass + review warning` exits `0` but reports `pass-with-review`.
- Blocking failure exits `1`.
- Tool/config/internal error exits `2`.

**Phase 1.2 evidence — 2026-05-31:**

- RED: `corepack pnpm exec vitest run tests/unit/report-schema.test.ts tests/unit/artifact-store.test.ts` failed because `src/core/report-schema.ts`, `src/core/artifact-store.ts`, `src/core/manifest.ts`, and `src/core/report-writer.ts` did not exist yet.
- GREEN: Added canonical report schemas/types, status/exit-code derivation, artifact store with path traversal guard, manifest creator, Markdown/JSON report writer, and basic failure classifier.
- CLI smoke: `node dist/cli.js run --mode smoke --report-dir /tmp/reflection-phase-1-2-smoke` wrote `report.json`, `report.md`, `manifest.json`, and a `runs/latest` pointer.
- Verification: `corepack pnpm typecheck`, `corepack pnpm test`, `corepack pnpm build`, CLI smoke, and `git diff --check` passed.
- Current scope note: `reflection run` now emits a placeholder environment check so the evidence pipeline exists before real browser contract checks. Phase 1.3 should replace the placeholder context with a real fixture app target; Phase 1.5 should replace the placeholder check with Playwright-produced browser checks.

### Phase 1.3 — Example app fixture

**Objective:** Provide a tiny real app that can prove the browser runner.

**Files:**
- Create: `examples/basic-react/package.json`
- Create: `examples/basic-react/index.html`
- Create: `examples/basic-react/src/main.tsx`
- Create: `examples/basic-react/reflection.config.ts`

**Routes/states:**

```text
/login
  desktop + mobile
  heading exists
  email/password labels exist
  sign-in button exists
  no signup/register text
  no horizontal overflow
  screenshot evidence

/overflow
  mobile intentionally overflows
  should fail noHorizontalOverflow

/console-error
  intentionally logs console.error
  should fail noConsoleErrors
```

**Acceptance:**

- The fixture can run locally with Vite.
- It has deterministic content, no dynamic timestamps, no network dependency.
- It provides one passing route and two failing route cases for tests.

**Phase 1.3 evidence — 2026-05-31:**

- RED: `corepack pnpm exec vitest run tests/unit/basic-react-fixture.test.ts` failed because `examples/basic-react/package.json`, `src/main.tsx`, and `reflection.config.ts` did not exist yet.
- GREEN: Added a minimal Vite/React fixture with deterministic `/login`, intentionally overflowing `/overflow`, and intentional console-error `/console-error` routes plus a Reflection browser contract config for those scenarios.
- Fixture smoke: `corepack pnpm install` and `corepack pnpm build` passed in `examples/basic-react`; a Vite dev server returned HTTP 200 for `/login`, `/overflow`, and `/console-error`.
- Verification: `corepack pnpm typecheck`, `corepack pnpm test`, `corepack pnpm build`, and `git diff --check` passed at the Reflection repo root.
- Current scope note: the fixture includes `reflection.config.ts` for the intended typed public surface, but runtime TS config loading is still a deliberate future task. Phase 1.4 can use the fixture server command/readiness values without needing TS config execution.

### Phase 1.4 — Server manager

**Objective:** Start or reuse a configured app server and wait for readiness.

**Files:**
- Create: `src/core/server-manager.ts`
- Create: `src/utils/process.ts`
- Test: `tests/integration/server-manager.test.ts`

**Required behavior:**

```ts
server: {
  command: 'pnpm dev --host 127.0.0.1',
  readyUrl: 'http://127.0.0.1:5173',
  reuseExisting: true,
  timeoutMs: 60_000
}
```

**Acceptance:**

- Reuses an already reachable `readyUrl` when configured.
- Starts the server when needed.
- Captures server logs into run artifacts on failure.
- Kills only processes it started.

**Phase 1.4 evidence — 2026-05-31:**

- RED: `corepack pnpm exec vitest run tests/integration/server-manager.test.ts` failed because `src/core/server-manager.ts` did not exist yet.
- GREEN: Added `startManagedServer`, `waitForUrl`, and a small managed process utility that starts shell commands, captures stdout/stderr to a configured log path, reuses reachable servers, and terminates only owned process groups.
- Focused verification: `corepack pnpm exec vitest run tests/integration/server-manager.test.ts` passed with reuse, start/wait/logging, and timeout cleanup coverage.
- Fixture smoke: built `dist`, then started `examples/basic-react` through the built server manager; it reported `{ started: true, reused: false, pidType: "number" }`, `/overflow` became reachable, and `stop()` made `/login` unreachable again.
- Verification: `corepack pnpm typecheck`, `corepack pnpm test`, `corepack pnpm build`, and `git diff --check` passed.
- Current scope note: the server manager is not wired into `reflection run` yet. Phase 1.5 should use it as the substrate for Playwright browser route execution and route artifact logs.

### Phase 1.5 — Playwright browser route runner

**Objective:** Render configured routes in Chromium across viewports and fixture states.

**Files:**
- Create: `src/integrations/playwright/browser-manager.ts`
- Create: `src/integrations/playwright/context-factory.ts`
- Create: `src/contracts/browser/browser-contract.ts`
- Create: `src/contracts/browser/route-runner.ts`
- Create: `src/contracts/browser/console-observer.ts`
- Create: `src/contracts/browser/overflow-check.ts`
- Create: `src/contracts/browser/assertions.ts`
- Test: `tests/integration/browser-contract.test.ts`

**MVP assertions:**

```text
urlIncludes
urlEquals
role
label
text
noText
selector
elementVisible
elementNotVisible
noHorizontalOverflow
noConsoleErrors
screenshot
```

**Screenshot output:**

```text
.reflection/runs/<run-id>/browser/<route-id>/<viewport>/actual.png
.reflection/runs/<run-id>/browser/<route-id>/<viewport>/metadata.json
```

**Acceptance:**

- `/login` passes on desktop and mobile.
- `/overflow` fails on mobile with a clear `layout-overflow` classification.
- `/console-error` fails with a clear `console-error` classification.
- Browser failures become blocking failures by default.
- Screenshots are saved and referenced in `report.json` and `report.md`.

**Phase 1.5 evidence — 2026-05-31:**

- RED: `corepack pnpm exec vitest run tests/integration/browser-contract.test.ts` failed because `src/contracts/browser/browser-contract.js` did not exist yet.
- GREEN: Added Playwright Chromium launch/context helpers, route runner, browser assertions, console-error observer, horizontal-overflow check, screenshot/metadata artifacts, and browser contract aggregation. Added `playwright` as a dev dependency.
- Fixture correction: `/login` mobile initially failed `noHorizontalOverflow`; fixed the fixture panel to use `boxSizing: 'border-box'` so the passing route is genuinely stable on mobile.
- CLI wiring: `reflection run` now starts the configured server, runs browser checks for `smoke`/`full`, writes screenshot artifacts into `browser/<route>/<viewport>/actual.png`, writes per-route metadata, summarizes check statuses, and exits `1` on blocking browser failures.
- Focused verification: `corepack pnpm exec vitest run tests/integration/browser-contract.test.ts` passed; `/login` passed desktop/mobile, `/overflow` failed as `layout-overflow`, and `/console-error` failed as `console-error`.
- CLI smoke: a login-only fixture config exited `0` with status `pass` and 2 screenshots; an all-routes fixture config exited `1` with status `fail`, 2 blocking failures, and 3 screenshots.
- Verification: `corepack pnpm typecheck`, `corepack pnpm test`, `corepack pnpm build`, and `git diff --check` passed.
- Current scope note: runtime loading of `reflection.config.ts` is still deferred. CLI smoke used temporary `.mjs` configs; Phase 1.6 should decide whether to add TS config loading now or document/use JS configs until the loader strategy is explicit.

### Phase 1.6 — Day 1 verification gate

**Objective:** Prove Day 1 works end-to-end.

**Commands:**

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
pnpm reflection run --config examples/basic-react/reflection.config.ts
pnpm reflection doctor --config examples/basic-react/reflection.config.ts
```

**Acceptance:**

- All tests pass.
- Build passes.
- Passing fixture route produces artifacts and exit code `0` when only passing routes are selected.
- Failing fixture cases produce exit code `1` and clear report entries.
- Report paths are real and readable.
- Final `git status --short` is reviewed before any commit.

**Phase 1.6 evidence — 2026-05-31:**

- Decision: baked in runtime `reflection.config.ts` loading now instead of continuing with temporary JavaScript configs, using `jiti` as the smallest practical loader for TypeScript config files.
- RED: `node dist/cli.js run --config examples/basic-react/reflection.config.ts --report-dir <tmp>` exited `2` because the built CLI could not import the TypeScript config/helper path.
- GREEN: `loadReflectionConfig` now resolves config paths to absolute paths and uses `jiti` for `.ts`, `.mts`, and `.cts` modules while preserving native dynamic import for JavaScript modules. Added regression coverage for TypeScript config files and relative TypeScript config paths.
- Fixture adjustment: the example config server command now uses `corepack pnpm --dir examples/basic-react dev --host 127.0.0.1` so the built CLI can start the fixture from the repo root in environments where bare `pnpm` is not on `PATH`.
- CLI smoke pass case: a temporary TypeScript login-only config exited `0`, reported status `pass`, project `basic-react-login-only`, and wrote desktop/mobile screenshot evidence.
- CLI smoke fail case: `node dist/cli.js run --config examples/basic-react/reflection.config.ts --report-dir <tmp>` exited `1`, reported status `fail`, project `basic-react`, 2 blocking failures, and classified them as `layout-overflow` and `console-error`.
- Verification: `corepack pnpm typecheck`, `corepack pnpm test` (8 files / 30 tests), `corepack pnpm build`, and `git diff --check` passed.

---

## Day 2: Visual smoke seam and review flow

### Day 2 goal

Add the smallest visual baseline comparison loop without making baselines dangerous.

### DevEx installation/setup direction

Reflection should have friendly setup, but it should not start with a magical broad `init` that silently mutates a repo. The better shape is a staged setup flow:

1. `reflection doctor` is read-only and always safe. It explains what is missing and can print suggested config/scripts.
2. `reflection init --dry-run` detects package manager/framework/dev server/Storybook and prints the exact files and package scripts it would create.
3. `reflection init --write` creates only the minimal files: `reflection.config.ts`, `.reflection/.gitkeep`, and suggested package scripts.
4. `reflection init --preset vite-react` / `--preset storybook` can be added before broad auto-detection, so the first experience is deterministic rather than clever.
5. `reflection init --from-greenhouse` can later adapt Greenhouse Spec route/component metadata into Reflection config without coupling the product identity to Greenhouse.

Recommendation: build the first install path as **doctor-first + dry-run init**, then add explicit presets. This keeps the nice Greenhouse-init feeling while preserving Reflection's safety rule: no silent baselines, no silent thresholds, no broad repo mutation.

### Phase 2.1 — Baseline store

**Objective:** Load baseline metadata and enforce safe baseline path rules.

**Files:**
- Create: `src/core/baseline-store.ts`
- Test: `tests/unit/baseline-store.test.ts`

**Acceptance:**

- Baselines resolve only inside `.reflection/baselines/` or configured baseline root.
- Missing baseline produces a controlled review/fail result according to case policy.
- Normal runs never create or update baselines.

**Phase 2.1 evidence — 2026-05-31:**

- RED: `corepack pnpm exec vitest run tests/unit/baseline-store.test.ts` failed because `src/core/baseline-store.ts` did not exist yet.
- GREEN: Added a read-only baseline store that resolves paths only inside the configured baseline root, reads metadata, and creates controlled missing-baseline visual checks as review warnings or blocking failures based on policy.
- Safety note: the baseline store intentionally exposes no write/update API; baseline mutation remains reserved for the later explicit `reflection update` flow.
- Verification: `corepack pnpm exec vitest run tests/unit/baseline-store.test.ts`, `corepack pnpm typecheck`, `corepack pnpm test` (9 files / 33 tests), `corepack pnpm build`, and `git diff --check` passed.

### Phase 2.2 — Image diff service

**Objective:** Compare actual and expected PNGs and produce metadata/diff image.

**Files:**
- Create: `src/contracts/visual/image-diff.ts`
- Create: `src/contracts/visual/thresholds.ts`
- Test: `tests/unit/image-diff.test.ts`

**Dependencies:**

```bash
pnpm add pngjs pixelmatch
pnpm add -D @types/pngjs
```

**Acceptance:**

- Equal PNGs pass.
- Dimension mismatch is classified separately.
- Diff over threshold becomes `warn` by default.
- Strict mode can convert selected diffs into blocking failure.

**Phase 2.2 evidence — 2026-05-31:**

- RED: `corepack pnpm exec vitest run tests/unit/image-diff.test.ts` failed because `src/contracts/visual/image-diff.ts` did not exist yet.
- GREEN: Added `pngjs`, `pixelmatch`, `@types/pngjs`, a pure PNG comparison service, and threshold evaluation for `maxDiffPixels` / `maxDiffPixelRatio`.
- Behavior: equal PNGs pass and can write a diff artifact, dimension mismatches classify as `visual-dimension-mismatch`, over-threshold diffs warn by default, and strict mode converts over-threshold diffs to fail.
- Verification: `corepack pnpm exec vitest run tests/unit/image-diff.test.ts`, `corepack pnpm typecheck`, `corepack pnpm test` (10 files / 38 tests), `corepack pnpm build`, and `git diff --check` passed.

### Phase 2.3 — Route visual smoke

**Objective:** Compare one route screenshot against a baseline.

**Files:**
- Create: `src/contracts/visual/visual-contract.ts`
- Create: `src/contracts/visual/baseline-compare.ts`
- Modify: `src/contracts/browser/route-runner.ts`
- Test: `tests/integration/visual-smoke.test.ts`

**Acceptance:**

- `/login` mobile actual screenshot compares to a checked-in fixture baseline.
- Actual/baseline/diff files are linked in the report.
- Visual diff is review-only unless strict mode is set.

**Phase 2.3 evidence — 2026-05-31:**

- RED: `corepack pnpm exec vitest run tests/integration/visual-smoke.test.ts` failed because `runBrowserContract` only returned browser checks; `visual.login-mobile` and missing-baseline visual checks were absent.
- GREEN: Added route visual smoke cases, read-only baseline resolution, visual expected/actual/diff artifact linking, and review-only missing-baseline reporting. The basic React fixture now has a checked-in `/login` mobile baseline.
- CLI smoke: `node dist/cli.js run --config /tmp/reflection-visual-smoke.config.mjs --report-dir /tmp/reflection-visual-cli-ioM2BC` passed with `environment.smoke.server`, `browser.login.mobile`, and `visual.login-mobile`; `report.json` linked `visual/login-mobile/{expected,actual,diff}.png` plus the browser actual screenshot.
- Verification: `corepack pnpm exec vitest run tests/integration/visual-smoke.test.ts`, `corepack pnpm typecheck`, `corepack pnpm test` (11 files / 40 tests), `corepack pnpm build`, and `git diff --check` passed.

### Phase 2.4 — Review command

**Objective:** Make latest evidence easy to inspect from the CLI.

**Files:**
- Create: `src/commands/review.ts`
- Test: `tests/unit/review-command.test.ts`

**Acceptance:**

```bash
reflection review
reflection review --latest
reflection review --json
```

prints:

- status
- blocking failures
- review items
- artifact paths
- suggested next steps

**Phase 2.4 evidence — 2026-05-31:**

- Validation phase before new work: independent review of Phase 2.3 found no secret/shell/eval/deserialization/SQL concerns, but did find two logic issues: dimension-mismatch visual comparisons could crash when no diff image was written, and `blocking: true` visual smoke cases were still reported as review warnings unless `strict` was also set.
- Fixes from validation: added unit coverage for `compareRouteVisualBaseline`; dimension mismatches now return a visual check with expected/actual artifacts and no missing diff stat; blocking visual diffs now become `status: fail` + `severity: blocking`; visual `maxDiffPixelRatio` config is constrained to `0..1`.
- RED: `corepack pnpm exec vitest run tests/unit/review-command.test.ts` initially failed because `src/commands/review.ts` did not exist. Config and baseline-compare validation tests also failed before their fixes.
- GREEN: Added `reflection review` CLI wiring plus `src/commands/review.ts`. The command reads `runs/latest` or `--run`, validates run IDs/path boundaries, parses `report.json`, prints human review output, and emits a stable JSON agent summary with blocking failures, review items, artifact paths, and next steps.
- Review hardening: rejects ambiguous `--latest` + `--run`, rejects unsafe latest-pointer run IDs, and has CLI-level coverage for `reflection review --json --report-dir <dir> --run <id>`.
- CLI smoke: `node dist/cli.js run --config /tmp/reflection-review-smoke.config.mjs --report-dir /tmp/reflection-review-cli-Z4VMot`, then `node dist/cli.js review --report-dir /tmp/reflection-review-cli-Z4VMot`, then `node dist/cli.js review --report-dir /tmp/reflection-review-cli-Z4VMot --json` passed. The review output listed `browser/login/mobile/actual.png`, metadata, and `visual/login-mobile/{expected,actual,diff}.png`.
- Verification: `corepack pnpm exec vitest run tests/unit/review-command.test.ts`, `corepack pnpm test` (13 files / 49 tests), `corepack pnpm typecheck`, `corepack pnpm build`, and `git diff --check` passed.
- Final independent validation review passed with no blocking security concerns or logic errors. Follow-up suggestions kept for later: include summary counts/passed checks in human review output if needed.

### Phase 2.5 — Update command dry-run and targeted update

**Objective:** Add explicit baseline update flow without CI mutation risk.

**Files:**
- Create: `src/commands/update.ts`
- Test: `tests/integration/update-command.test.ts`

**Acceptance:**

- `reflection update --route login --from-run latest --dry-run` reports intended changes without writing.
- Non-dry targeted update copies only the selected actual screenshot into the selected baseline path.
- CI mode refuses baseline updates.
- Untargeted “update everything” is avoided or requires an explicit `--all` guard.

**Phase 2.5 evidence — 2026-06-01:**

- Validation phase before new work: independent review of Phase 2.4 found no secret/shell/eval/deserialization/SQL concerns, but requested hardening for report symlink reads and unsafe artifact paths. `reflection review` now realpath-checks `runs/latest`, the selected run directory, and `report.json`; rejects report/run mismatches; and rejects absolute or escaping artifact paths before emitting agent summaries.
- RED: `corepack pnpm exec vitest run tests/integration/update-command.test.ts` initially failed because `src/commands/update.ts` did not exist. CLI wiring coverage then failed before `src/cli.ts` registered `update`.
- GREEN: Added `reflection update` CLI wiring plus `src/commands/update.ts`. The command supports `--route`, `--case`, explicit `--all`, `--from-run latest|<runId>`, and `--dry-run`; non-dry updates copy only selected actual PNG artifacts into configured baseline paths.
- Safety hardening: update refuses CI mutation, untargeted updates, mixed `--all` + targeted selectors, unsafe run IDs, symlinked/escaping `latest`, run directories, report files, and source artifacts. Baseline writes validate the configured root and walk/create destination directories without following intermediate symlinks; existing destination symlinks are refused before overwrite.
- RED/GREEN validation loop: regression tests first failed for `report.json` symlink escape, mixed `--all` selectors, symlinked `runs/latest`, review latest symlink escape, and intermediate baseline directory symlink creation outside the baseline root; each passed after the targeted fix.
- Verification: `corepack pnpm exec vitest run tests/unit/review-command.test.ts tests/integration/update-command.test.ts` (21 tests), `corepack pnpm typecheck`, `corepack pnpm test` (14 files / 66 tests), `corepack pnpm build`, and `git diff --check` passed.
- Final independent validation review passed with no blocking security concerns or logic errors after the symlink/path hardening fixes.

---

## Day 3: Artifact lifecycle, safety, and CI shape

### Day 3 goal

Make generated evidence safe, maintainable, and CI-compatible.

### Phase 3.1 — Manifest-based GC

**Objective:** Delete only eligible run artifacts and never baselines.

**Files:**
- Create: `src/commands/gc.ts`
- Create: `src/core/gc.ts`
- Test: `tests/unit/gc.test.ts`

**Acceptance:**

- `reflection gc --dry-run` lists eligible run dirs.
- Deletion only occurs under configured artifact root.
- A directory must contain a valid manifest before deletion.
- Pinned runs are preserved.
- `.reflection/baselines/` is never deleted by normal GC.

**Phase 3.1 evidence — 2026-06-01:**

- RED: `corepack pnpm exec vitest run tests/unit/gc.test.ts` failed because `src/core/gc.ts` did not exist yet.
- GREEN: Added manifest-based `collectGarbage` plus `reflection gc` CLI wiring. GC dry-runs by default, supports explicit `--delete`, considers only run directories with valid manifests eligible, skips pinned runs, and reports skipped invalid/no-manifest entries.
- Safety hardening: GC rejects a symlinked `runs` directory, resolves candidates under the real configured runs directory, refuses/safely skips symlinked run directories that resolve outside the runs directory, revalidates candidate safety immediately before deletion, requires `manifest.runId` to match the directory name, ignores the `runs/latest` pointer, and never traverses into `.reflection/baselines/`.
- Review loop: independent pre-commit review found that validating candidates only against the artifact root could allow a symlinked `runs` directory to redirect deletion into in-root baselines. Added a RED regression for that case, then fixed GC to reject symlinked `runs` directories and revalidated.
- CLI smoke: built `dist`, created a temporary artifact root with one eligible run, one pinned run, and a baseline file; `node dist/cli.js gc --report-dir <tmp> --dry-run` listed only the eligible run, and `node dist/cli.js gc --report-dir <tmp> --delete` removed that run while preserving the pinned run and baseline.
- Verification: `corepack pnpm exec vitest run tests/unit/gc.test.ts`, `corepack pnpm typecheck`, `corepack pnpm test` (15 files / 71 tests), `corepack pnpm build`, CLI smoke, and `git diff --check` passed.

### Phase 3.2 — Redaction and artifact policy

**Objective:** Keep sensitive data out of reports/artifacts where possible.

**Files:**
- Create: `src/core/redaction.ts`
- Create: `src/integrations/playwright/trace-policy.ts`
- Test: `tests/unit/redaction.test.ts`

**Acceptance:**

- Authorization/cookie headers are redacted from captured logs.
- Configured `maskSelectors` are applied before screenshots.
- Report warns when traces/screenshots may contain private data.
- Videos are off by default.

### Phase 3.3 — CI report directory and workflow example

**Objective:** Make `reflection run --ci` reliable in CI.

**Files:**
- Create: `docs/ci.md`
- Create: `.github/workflows/reflection.yml` only when this repo has useful self-check examples
- Test: `tests/e2e/ci-mode.test.ts`

**Acceptance:**

- `--ci` writes to `artifacts/reflection` by default.
- workers default to `1` for visual stability.
- CI never updates baselines.
- Exit codes match the public spec.

---

## Day 4: Design command adapter

### Day 4 goal

Wrap existing deterministic design/source validators without claiming pixel parity.

### Phase 4.1 — Command adapter

**Objective:** Run configured commands and normalize stdout/stderr/exit code into `CheckResult` values.

**Files:**
- Create: `src/contracts/design/design-contract.ts`
- Create: `src/contracts/design/command-adapter.ts`
- Test: `tests/integration/design-command-adapter.test.ts`

**Acceptance:**

- `reflection run --mode design` can run configured commands.
- Exit code `0` becomes pass.
- Non-zero exit becomes blocking failure unless configured otherwise.
- Output is summarized, with full logs as artifacts.
- The report wording says token/source contract, not full visual parity.

### Phase 4.2 — Family-level normalization

**Objective:** Allow validators to emit structured JSON for richer family-level checks.

**Acceptance:**

- If command emits Reflection-compatible JSON, preserve family/target metadata.
- If not, produce a global design check result.

---

## Day 5: Storybook component visual parity

### Day 5 goal

Compare one cached expected component image against one Storybook-rendered state.

### Phase 5.1 — Storybook server and index lookup

**Objective:** Start/reuse Storybook and resolve story URLs.

**Files:**
- Create: `src/integrations/storybook/server.ts`
- Create: `src/integrations/storybook/index-json.ts`
- Create: `src/integrations/storybook/story-url.ts`
- Test: `tests/integration/storybook-index.test.ts`

**Acceptance:**

- `storyId` resolves through `/index.json`.
- Storybook server is started/reused like app server.
- Missing story produces a clear setup/config failure.

### Phase 5.2 — Component visual case

**Objective:** Capture one deterministic component state and compare it to a cached expected image.

**Acceptance:**

- One button case produces expected/actual/diff artifacts.
- Result is review-only by default.
- Strict mode can make it blocking for selected stable cases.

### Phase 5.3 — Pseudo-state policy

**Objective:** Prefer explicit story states before browser-forced pseudo states.

**Acceptance:**

- Config supports a state note, but implementation first uses story args/decorators.
- Browser hover/focus can be added only with animation stabilization.

---

## Day 6: External spec adapter seam

### Day 6 goal

Define a clean adapter boundary for future external spec systems without making Reflection depend on them.

### Phase 6.1 — Target IR

**Objective:** Introduce a small internal representation for route/component/design targets.

**Acceptance:**

- Reflection config compiles into target IR.
- External adapters can later compile into the same IR.
- No external product name appears in core user-facing commands.

### Phase 6.2 — Adapter proof

**Objective:** Add a fixture adapter that converts a JSON route manifest into Reflection route targets.

**Acceptance:**

- Adapter is optional.
- Core browser runner does not know where targets came from.
- This validates future integration without coupling.

---

## Day 7: Product hardening and docs

### Day 7 goal

Make the project understandable and ready for continued dogfooding.

### Phase 7.1 — Documentation pass

**Files:**
- Create: `docs/getting-started.md`
- Create: `docs/configuration.md`
- Create: `docs/browser-contract.md`
- Create: `docs/visual-contract.md`
- Create: `docs/artifacts-and-gc.md`
- Create: `docs/agent-workflows.md`

**Acceptance:**

- A new repo can manually add Reflection with a minimal config.
- Docs clearly distinguish evidence screenshots from baselines.
- Docs explain that visual diffs are review-only by default.

### Phase 7.2 — Dogfood decision gate

**Objective:** Decide whether Reflection is ready for real project dogfooding.

**Acceptance checklist:**

- `reflection run` works locally against `examples/basic-react`.
- Browser contract catches route/layout/console failures.
- Reports are understandable without raw logs.
- Agents can parse `report.json` and identify next steps.
- GC cannot delete baselines or unrelated files.
- Visual strictness remains opt-in.
- No public names contain `greenhouse`.

---

## First implementation recommendation

Start Day 1 with these exact first tasks:

1. Install dependencies and verify TypeScript skeleton builds.
2. Move CLI command bodies out of `src/cli.ts` into command modules.
3. Add config schema and `defineReflection` helper.
4. Add report schema and artifact writer with dummy checks.
5. Add basic React fixture app.
6. Add server manager.
7. Add Playwright browser route runner.
8. Add DOM/layout/console assertions.
9. Run end-to-end against fixture routes.
10. Commit only after `pnpm typecheck`, `pnpm test`, and `pnpm build` are clean.

If tool budget or runtime setup gets tight, stop after a clean committed boundary. Do not leave half-written browser runner files without tests.
