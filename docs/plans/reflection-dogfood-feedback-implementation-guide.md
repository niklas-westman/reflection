# Implementation Guide: Reflection Dogfood Feedback

Created: 2026-06-01
Status: draft
Branch: TBD

---

## Living Document

This guide must be updated during implementation:

- Check off tasks as they are completed.
- Add notes when reality diverges from plan.
- Reorder or split phases when blockers are discovered.
- Add new tasks discovered during implementation.
- Mark tasks as "skipped — reason" when they become irrelevant.
- Record timestamps on phase completions for velocity tracking.
- Update the test coverage map as tests are written.

**Last updated:** 2026-06-02
**Current phase:** Complete

---

## 0. Project Discovery

### Discovery Summary

| Variable | Value |
|---|---|
| Package manager | pnpm (`pnpm-lock.yaml`) |
| Monorepo | No root workspace; includes `examples/basic-react` fixture app |
| Test runner | Vitest |
| Test command | `pnpm test` |
| Typecheck | `pnpm typecheck` |
| Lint | No lint script discovered |
| Build | `pnpm build` |
| Domain checks | `pnpm smoke:package`, `pnpm pack`, `npm publish --dry-run --access public` |
| CI | `.github/workflows/reflection.yml` |
| Feature paths | `src/commands/doctor.ts`, `src/commands/run.ts`, `src/core/config.ts`, `src/contracts/browser/**`, `src/core/report-schema.ts`, `docs/**`, `scripts/smoke-package-install.mjs` |
| Existing tests | `tests/unit/**/*.test.ts`, `tests/integration/**/*.test.ts`, `tests/e2e/**/*.test.ts` |

### Validation Stack

| Purpose | Command | Scope |
|---|---|---|
| Unit/integration/e2e tests | `pnpm test` | Full package |
| Typecheck | `pnpm typecheck` | TypeScript package |
| Build | `pnpm build` | Dist output |
| Package install smoke | `pnpm smoke:package` | Packed package in temp consumer |
| Publish dry-run | `npm publish --dry-run --access public` | npm packaging |

Validated during guide creation:

```bash
pnpm test
pnpm typecheck
pnpm build
pnpm smoke:package
npm publish --dry-run --access public
```

Current package state:

- Published package name: `reflection-check`.
- Public import path: `import { defineReflection } from 'reflection-check';`
- CLI binaries: `reflection`, `reflection-check`.
- Node engine: `>=22`.
- Runtime browser dependency: `playwright`.
- Dogfood patch candidate: missing-baseline visual checks now carry the current actual screenshot so `reflection update --dry-run` and targeted update can promote first baselines.

---

## 1. Architecture Contract

### Problem Statement

Sourcer dogfooding proved that `reflection-check@0.0.1` can be installed from npm and can produce useful browser evidence, but it also exposed gaps: `doctor` is too shallow, authenticated app setup requires a pattern, report next steps are generic, and setup/CI/baseline flows need stronger first-class support.

### Chosen Approach

Convert feedback into small, test-first package improvements. Prioritize improvements that help any consuming app before Sourcer-specific features: better `doctor --config`, explicit browser setup hooks, actionable report suggestions, an `init --dry-run` flow, and CI/package documentation. Keep Reflection read-only by default and avoid silently mutating baselines or target repos.

### Architecture Boundaries

| Layer | Owns | Does Not Own |
|---|---|---|
| CLI commands | User-facing command flow, errors, dry-run safety | App-specific state or fixtures |
| Config schema | Stable declarative contract and typed helper | Implicit target repo mutation |
| Browser contract | Route execution, setup hooks, assertions, screenshots | Login credentials or backend data generation |
| Report/review | Accurate status, artifacts, next steps | Product-specific remediation content |
| Docs/scripts | Package install, CI, release and dogfood workflow | Hidden local machine assumptions |

### Non-Negotiables

- [ ] Normal `reflection run` must not create or update baselines.
- [ ] `reflection update` stays explicit and targeted.
- [ ] `doctor` remains read-only.
- [ ] Setup hooks must not encourage real credentials or sensitive data in committed config.
- [ ] Public import path remains `reflection-check`.
- [ ] Package smoke must prove install from packed artifact before release.

---

## 2. Implementation Phases

### Patch 0.0.2 Candidate: Missing Baseline Promotion

**Goal:** Fix the Sourcer-discovered limitation where missing-baseline dry-run/update could not promote the current actual screenshot.
**Depends on:** Current `0.0.1` package shape
**Status:** Complete in working tree; full package validation passed. The combined release candidate is now `reflection-check@0.0.3`, and `npm publish --dry-run --access public` passes.

#### Inputs

- Sourcer feedback: approving first login visual baselines was blocked because missing-baseline visual checks did not expose an `actual` artifact to `reflection update`.
- Existing visual smoke and update command tests.

#### Outputs

- Missing-baseline visual checks include `visual/<case-id>/actual.png`.
- `reflection update --dry-run --case <caseId>` can plan first-baseline promotion.
- Non-dry targeted update can create the missing baseline root and nested baseline path.

#### Relevant Paths

| What | Path | Action |
|---|---|---|
| Missing baseline check | `src/core/baseline-store.ts` | Edited |
| Visual comparison | `src/contracts/visual/baseline-compare.ts` | Edited |
| Baseline update | `src/commands/update.ts` | Edited |
| Visual smoke tests | `tests/integration/visual-smoke.test.ts` | Edited |
| Update tests | `tests/integration/update-command.test.ts` | Edited |

#### Tasks

- [x] Add RED test proving missing-baseline visual checks expose actual screenshot artifacts.
  - **Tool:** edit
  - **Verify:** `pnpm exec vitest run tests/integration/visual-smoke.test.ts`

- [x] Add RED test proving update can dry-run and promote a missing baseline into a new path.
  - **Tool:** edit
  - **Verify:** `pnpm exec vitest run tests/integration/update-command.test.ts`

- [x] Implement missing-baseline actual artifact and missing baseline root creation.
  - **Tool:** edit
  - **Verify:** focused tests pass.

#### Tests for This Patch

| Test Type | What to Test | Exists? | Path / Command |
|---|---|---|---|
| Integration | Missing-baseline check links current actual artifact | Yes | `pnpm exec vitest run tests/integration/visual-smoke.test.ts` |
| Integration | Update promotes missing baseline into new path | Yes | `pnpm exec vitest run tests/integration/update-command.test.ts` |
| Full package | No regressions | Required before publish | `pnpm test`, `pnpm typecheck`, `pnpm smoke:package` |

#### Patch Exit Criteria

- [x] Focused visual/update tests pass.
- [x] Full validation passes.
- [x] Version bumped for patch release.
- [ ] Sourcer verifies first login baseline dry-run against the patched package.
- [x] Guide updated with publish outcome.

#### Failure Protocol

| If | Then |
|---|---|
| Dry-run still cannot find actual artifact | Inspect `report.json` visual check artifacts before update planning |
| Non-dry update cannot create baseline path | Inspect baseline root existence and symlink safety checks |
| Sourcer still cannot approve baseline | Reproduce with Sourcer artifacts and add another integration test here |

---

### Phase 1: Useful `doctor --config`

**Goal:** Turn `doctor` from a shallow status command into a real read-only preflight for consuming repos.
**Depends on:** Current `0.0.1` package shape
**Status:** Complete

#### Inputs

- Existing `src/commands/doctor.ts`.
- Existing config loader in `src/core/config.ts`.
- Server readiness behavior in `src/core/server-manager.ts`.
- Sourcer feedback: doctor previously only printed a one-line status message.

#### Outputs

- `doctor --config` validates config file presence/import/schema.
- Doctor reports package/runtime readiness: Node version, Playwright import, browser availability if safe to check, configured routes count, server config summary.
- Doctor can optionally check server reachability without starting a long-running process unless explicitly configured.
- Machine-friendly errors with non-zero exit for invalid setup.

#### Relevant Paths

| What | Path | Action |
|---|---|---|
| Doctor command | `src/commands/doctor.ts` | Edit |
| Config loader | `src/core/config.ts` | Read |
| CLI wiring | `src/cli.ts` | Read/Edit if options change |
| Exit codes | `src/core/exit-codes.ts` | Read |
| Tests | `tests/unit/cli.test.ts`, new `tests/unit/doctor-command.test.ts` | Edit/Create |
| Docs | `docs/getting-started.md`, `docs/validation-process.md` | Edit |

#### Tasks

- [x] Add failing unit tests for valid config, missing config, invalid config, and config summary output.
  - **Tool:** edit
  - **Verify:** `pnpm exec vitest run tests/unit/doctor-command.test.ts`

- [x] Implement config-aware doctor output.
  - **Tool:** edit
  - **Verify:** focused doctor tests pass.

- [x] Add runtime checks that do not mutate or start target state unexpectedly.
  - **Tool:** edit
  - **Verify:** tests cover Playwright/package readiness and safe server summary.

- [x] Update docs to describe doctor as a config-aware preflight.
  - **Tool:** edit
  - **Verify:** stale doctor wording search returns no matches in active docs, source, or tests.

#### Implementation Notes

- `reflection doctor --config` now validates config presence/import/schema and exits with `ExitCode.ToolOrConfigError` for invalid config.
- `doctor` reports Node version, Playwright package readiness, Chromium executable presence when available, enabled contract counts, base URL, and server configuration.
- Doctor remains read-only: it does not start configured servers, mutate baselines, or write reports.
- Added `--check-server` for an explicit one-shot `readyUrl` probe without starting the server.

#### Tests for This Phase

| Test Type | What to Test | Exists? | Path / Command |
|---|---|---|---|
| Unit | Doctor config success/failure summaries | Yes | `tests/unit/doctor-command.test.ts` |
| CLI | `reflection doctor --config` exit behavior | Yes | `tests/unit/cli.test.ts` |
| Type safety | Doctor options/types | Auto | `pnpm typecheck` |
| Package smoke | Installed CLI can run doctor | Yes | `pnpm smoke:package` |

#### Phase Exit Criteria

- [x] `doctor --config` reports meaningful setup information.
- [x] Invalid config exits non-zero with actionable error.
- [x] Docs match behavior.
- [x] `pnpm test`, `pnpm typecheck`, `pnpm smoke:package` pass.
- [x] Guide updated with completion status.

#### Failure Protocol

| If | Then |
|---|---|
| Doctor becomes too slow | Split checks into default read-only and optional deep check |
| Check requires browser install | Report actionable warning instead of hard failure unless required |
| Output becomes noisy | Keep human summary concise; put detail in JSON later if needed |

---

### Phase 2: Browser Setup Hooks for Authenticated Apps

**Goal:** Support authenticated app smoke tests without Sourcer-specific hacks.
**Depends on:** Phase 1
**Status:** Complete

#### Inputs

- Sourcer need: seed localStorage/session or preload state before navigation.
- Existing browser context factory and route runner.
- Existing config schema and route expectation model.

#### Outputs

- Config schema supports browser-level and route-level `setup.localStorage` / `setup.sessionStorage`.
- Route runner applies setup before visiting a route.
- Metadata records that setup was applied without logging sensitive values.
- Docs include examples for non-secret test tokens and mock/test-mode auth.

#### Relevant Paths

| What | Path | Action |
|---|---|---|
| Config schema | `src/core/config.ts` | Edit |
| Route runner | `src/contracts/browser/route-runner.ts` | Edit |
| Context factory | `src/integrations/playwright/context-factory.ts` | Edit if storage state belongs there |
| Browser tests | `tests/integration/browser-contract.test.ts` | Edit |
| Redaction | `src/core/redaction.ts`, `tests/unit/redaction.test.ts` | Read/Edit if metadata changes |
| Docs | `docs/configuration.md`, `docs/browser-contract.md` | Edit |

#### Tasks

- [x] Design the smallest setup API and document rejected alternatives.
  - **Tool:** research/edit guide
  - **Verify:** decision recorded before implementation.

- [x] Add failing config tests for setup schema.
  - **Tool:** edit
  - **Verify:** `pnpm exec vitest run tests/unit/config.test.ts`

- [x] Add failing integration test proving localStorage/session setup before route navigation.
  - **Tool:** edit
  - **Verify:** `pnpm exec vitest run tests/integration/browser-contract.test.ts`

- [x] Implement setup support and metadata redaction.
  - **Tool:** edit
  - **Verify:** focused tests pass.

#### Decision Notes

- Chosen API: `setup.localStorage` and `setup.sessionStorage` as string key/value maps at browser and route scope.
- Browser-level setup applies to every route; route-level setup extends or overrides browser-level keys.
- Rejected for this phase: arbitrary `beforeNavigate` script hooks because they are too broad and harder to make safe; `storageState` files because the current Sourcer need is simple seeded browser storage and key-only metadata.
- Report metadata records only storage key names, not values.

#### Tests for This Phase

| Test Type | What to Test | Exists? | Path / Command |
|---|---|---|---|
| Unit | Config schema accepts setup and rejects unsafe shapes | Yes | `tests/unit/config.test.ts` |
| Integration | Route sees seeded storage before render | Yes | `tests/integration/browser-contract.test.ts` |
| Redaction | Setup metadata does not leak token values | Yes, integration metadata assertion | `tests/integration/browser-contract.test.ts` |
| Docs | Example compiles conceptually | Manual | `docs/configuration.md`, `docs/browser-contract.md` |

#### Phase Exit Criteria

- [x] Auth setup can be expressed without real credentials.
- [x] Route runner applies setup before assertions.
- [x] Sensitive values are not printed in report metadata.
- [x] Sourcer can add one authenticated route without app-specific Reflection changes.
- [x] Full validation passes.

#### Failure Protocol

| If | Then |
|---|---|
| API risks leaking secrets | Switch to file path/env reference or key-only metadata |
| Setup API becomes too broad | Start with localStorage/storageState only |
| Sourcer still cannot auth | Document missing app fixture requirement; do not overfit Reflection |

---

### Phase 3: Actionable Report Suggestions

**Goal:** Replace generic next steps with report suggestions derived from actual run results.
**Depends on:** Phase 1
**Status:** Complete

#### Inputs

- Current generic suggestion in `src/commands/run.ts`: "Implement the next contract runner phase."
- Review command JSON output.
- Sourcer feedback: generic suggestion is not useful in a consuming repo.

#### Outputs

- Suggested next steps reflect status:
  - blocking failures → fix named checks.
  - review-only visual diffs → inspect artifacts or dry-run update.
  - missing baselines → create/review baseline.
  - pass → no action required, optionally expand coverage.
- Review JSON remains stable and concise.

#### Relevant Paths

| What | Path | Action |
|---|---|---|
| Run command | `src/commands/run.ts` | Edit |
| Report schema | `src/core/report-schema.ts` | Read/Edit if needed |
| Report writer | `src/core/report-writer.ts` | Read/Edit |
| Review command | `src/commands/review.ts` | Read/Edit |
| Tests | `tests/unit/report-schema.test.ts`, `tests/unit/review-command.test.ts`, `tests/e2e/ci-mode.test.ts` | Edit |

#### Tasks

- [x] Add tests for suggested steps by result type.
  - **Tool:** edit
  - **Verify:** `pnpm exec vitest run tests/unit/review-command.test.ts tests/unit/report-schema.test.ts`

- [x] Implement derived suggestions.
  - **Tool:** edit
  - **Verify:** focused tests pass.

- [x] Update docs with examples of pass/fail/review suggestions.
  - **Tool:** edit
  - **Verify:** docs mention dry-run update for visual review.

#### Tests for This Phase

| Test Type | What to Test | Exists? | Path / Command |
|---|---|---|---|
| Unit | Derived suggestions for fail/review/pass | Yes | `tests/unit/report-schema.test.ts` |
| Schema | Suggested step shape remains stable | Yes | `tests/unit/report-schema.test.ts` |
| E2E | CI report has useful next steps | Yes | `tests/e2e/ci-mode.test.ts` |

#### Phase Exit Criteria

- [x] No report emits the old generic implementation suggestion for consuming-project passes.
- [x] Review JSON remains parseable.
- [x] Full validation passes.

#### Failure Protocol

| If | Then |
|---|---|
| Suggestions become too verbose | Keep JSON summaries short and rely on artifact paths |
| Status mapping is ambiguous | Prefer conservative inspect/fix language |

---

### Phase 4: Safe `reflection init --dry-run`

**Goal:** Make first-time setup easier while preserving read-only safety by default.
**Depends on:** Phase 1
**Status:** Complete

#### Inputs

- Sourcer setup steps: install package, add config, scripts, ignores, AGENTS pointer.
- Existing CLI structure.
- Docs install flow.

#### Outputs

- `reflection init --dry-run` detects package manager and prints proposed files/scripts.
- `reflection init --dry-run` is read-only and refuses to write. Any future write mode must be explicit and separately approved.
- Preset support starts explicit, for example `--preset vite-react`.

#### Relevant Paths

| What | Path | Action |
|---|---|---|
| CLI | `src/cli.ts` | Edit |
| New command | `src/commands/init.ts` | Create |
| Config helper | `src/core/config.ts` or new setup module | Read/Create |
| Tests | `tests/unit/cli.test.ts`, new `tests/unit/init-command.test.ts` | Edit/Create |
| Docs | `docs/getting-started.md`, `docs/agent-workflows.md` | Edit |

#### Tasks

- [x] Add failing CLI tests for `init --dry-run`.
  - **Tool:** edit
  - **Verify:** `pnpm exec vitest run tests/unit/init-command.test.ts tests/unit/cli.test.ts`

- [x] Implement read-only dry-run with detected package manager and suggested commands.
  - **Tool:** edit
  - **Verify:** focused tests pass.

- [x] Document that `init --write` is not required for consumers and must be explicit if added.
  - **Tool:** edit
  - **Verify:** docs mention dry-run safety.

#### Tests for This Phase

| Test Type | What to Test | Exists? | Path / Command |
|---|---|---|---|
| Unit | Dry-run output for pnpm repo | Yes | `tests/unit/init-command.test.ts` |
| CLI | Command registration and invalid options | Yes | `tests/unit/cli.test.ts` |
| Package smoke | New CLI still works installed | Yes | `pnpm smoke:package` |

#### Phase Exit Criteria

- [x] `reflection init --dry-run` is read-only.
- [x] Output matches current package name `reflection-check`.
- [x] No repo files are mutated without `--write`.
- [x] Full validation passes.

#### Failure Protocol

| If | Then |
|---|---|
| Auto-detection is unreliable | Require explicit preset before writing |
| User could confuse dry-run/write | Make write opt-in and noisy |

---

### Phase 5: CI and Baseline Workflow Polish

**Goal:** Make consuming-repo CI and visual baseline workflows obvious and hard to misuse.
**Depends on:** Phases 1-3
**Status:** Complete

#### Inputs

- Sourcer CI needs.
- Existing docs in `docs/ci.md`, `docs/validation-process.md`, and `docs/visual-contract.md`.
- Existing update command tests.

#### Outputs

- CI docs use public npm install and explicit report dir.
- Baseline update docs include dry-run first and artifact inspection.
- Optional example workflow for consuming repos.
- Better `update --dry-run` output if Sourcer dogfooding shows gaps.

#### Relevant Paths

| What | Path | Action |
|---|---|---|
| CI docs | `docs/ci.md` | Edit |
| Validation process | `docs/validation-process.md` | Edit |
| Visual contract docs | `docs/visual-contract.md` | Edit |
| Update command | `src/commands/update.ts` | Read/Edit if output changes |
| Tests | `tests/integration/update-command.test.ts`, `tests/e2e/ci-mode.test.ts` | Edit |

#### Tasks

- [x] Update CI docs around `pnpm add -D reflection-check` and `reflection run --ci`.
  - **Tool:** edit
  - **Verify:** docs contain public package install path.

- [x] Add or update CI-mode e2e tests if command shape changes.
  - **Tool:** edit
  - **Verify:** `pnpm exec vitest run tests/e2e/ci-mode.test.ts`.

- [x] Improve baseline update dry-run messaging if needed.
  - **Tool:** edit
  - **Verify:** `pnpm exec vitest run tests/integration/update-command.test.ts`.

#### Tests for This Phase

| Test Type | What to Test | Exists? | Path / Command |
|---|---|---|---|
| E2E | CI report root, docs, and review | Yes | `tests/e2e/ci-mode.test.ts` |
| Integration | Baseline update dry-run safety and messaging | Yes | `tests/integration/update-command.test.ts` |
| Package | Public install smoke remains valid | Yes | `pnpm smoke:package` |

#### Phase Exit Criteria

- [x] Consuming repo CI docs are copy-pasteable.
- [x] Baseline update process is clear and safe.
- [x] Full validation passes.

#### Failure Protocol

| If | Then |
|---|---|
| CI instructions conflict with package docs | Make package docs canonical and link from workflow examples |
| Update workflow feels too easy to misuse | Require more explicit target flags or confirmation text |

---

## 3. Repeatable Unit Contract

### Unit Template: Reflection Feedback Item

| Step | Description | Path | Action | Verify | Test |
|---|---|---|---|---|---|
| 1 | Write failing test for the feedback item | `tests/**` | Create/Edit | Focused `pnpm exec vitest run ...` fails first | Required |
| 2 | Implement smallest package change | `src/**` | Edit | Focused test passes | Required |
| 3 | Update docs and examples | `docs/**`, `README.md`, `scripts/**` | Edit | `rg` confirms stale wording removed | Required |
| 4 | Validate package install | `scripts/smoke-package-install.mjs` | Run | `pnpm smoke:package` | Required |
| 5 | Record dogfood outcome | This guide | Edit | Completion tracker updated | Required |

**Unit done when:**

- [x] Focused tests pass.
- [x] `pnpm test`, `pnpm typecheck`, and `pnpm smoke:package` pass.
- [x] Public package docs remain accurate.
- [x] Guide updated.

### Units

| Unit | Status | Tests | Validation | Notes |
|---|---|---|---|---|
| Useful doctor | Complete | focused and full pass | full pass; publish dry-run passed for 0.0.3 | Highest value from Sourcer feedback |
| Browser setup hooks | Complete | focused and full pass | full pass; publish dry-run passed for 0.0.3 | Enables authenticated Sourcer coverage |
| Actionable next steps | Complete | focused and full pass | full pass; publish dry-run passed for 0.0.3 | Replaces generic report suggestion |
| Init dry-run | Complete | focused and full pass | full pass; package smoke verifies installed init | Improves new project setup |
| CI/baseline docs polish | Complete | focused and full pass | full pass; publish dry-run passed for 0.0.3 | Needed before broader use |

---

## 4. Test Strategy

### Principles

- Every feedback item starts with a failing test.
- Prefer unit tests for CLI/config/report behavior and integration tests for browser behavior.
- Package smoke must pass for any public-surface change.
- npm publish dry-run should pass before any release.

### Coverage Map

| Phase | What's Tested | Test Type | Exists? | Path |
|---|---|---|---|---|
| Phase 1 | Doctor config preflight | Unit/CLI | Yes | `tests/unit/doctor-command.test.ts`, `tests/unit/cli.test.ts` |
| Phase 2 | Browser setup hooks | Unit/integration | Yes | `tests/unit/config.test.ts`, `tests/integration/browser-contract.test.ts` |
| Phase 3 | Derived next steps | Unit/e2e | Yes | `tests/unit/report-schema.test.ts`, `tests/e2e/ci-mode.test.ts` |
| Phase 4 | Init dry-run | Unit/CLI/package smoke | Yes | `tests/unit/init-command.test.ts`, `tests/unit/cli.test.ts`, `scripts/smoke-package-install.mjs` |
| Phase 5 | CI/baseline docs and safety | E2E/integration | Yes | `tests/e2e/ci-mode.test.ts`, `tests/integration/update-command.test.ts` |

### Full Validation Run

Run after every phase completion:

```bash
pnpm test
pnpm typecheck
pnpm build
pnpm smoke:package
npm publish --dry-run --access public
```

---

## 5. Failure and Rollback Protocol

| Failure Type | Detection | Action |
|---|---|---|
| Test failure | `pnpm test` or focused Vitest command exits non-zero | Fix before proceeding |
| Type error | `pnpm typecheck` exits non-zero | Check config/report public types |
| Package smoke failure | `pnpm smoke:package` exits non-zero | Fix exports, bin, dependencies, or pack files |
| Publish dry-run warning | npm emits corrections/warnings | Fix `package.json`; rerun dry-run |
| Browser flake | Integration test intermittently fails | Stabilize fixture, viewport, or threshold; do not hide failure |
| Secret exposure risk | Report/log contains sensitive values | Add redaction or remove value from metadata |
| Ambiguous requirement | Cannot determine safe behavior | Stop and ask Niklas |
| Repeated failure | Same check fails 3 times | Reassess approach and update this guide |

---

## 6. Completion Tracker

| Phase | Title | Status | Tests | Validation | Completed |
|---|---|---|---|---|---|
| Patch | Missing Baseline Promotion | Complete | full pass | included in 0.0.3 candidate; publish dry-run passed | 2026-06-02 |
| 1 | Useful `doctor --config` | Complete | full pass | included in 0.0.3 candidate; publish dry-run passed | 2026-06-02 |
| 2 | Browser Setup Hooks for Authenticated Apps | Complete | full pass | included in 0.0.3 candidate; publish dry-run passed | 2026-06-02 |
| 3 | Actionable Report Suggestions | Complete | full pass | included in 0.0.3 candidate; publish dry-run passed | 2026-06-02 |
| 4 | Safe `reflection init --dry-run` | Complete | full pass | package smoke verifies installed init; publish dry-run passed | 2026-06-02 |
| 5 | CI and Baseline Workflow Polish | Complete | full pass | included in 0.0.3 candidate; publish dry-run passed | 2026-06-02 |

---

## 7. Post-Completion Checklist

- [x] All phases marked complete or skipped with reason.
- [ ] Full validation suite passes.
- [ ] `pnpm smoke:package` proves public install surface.
- [ ] `npm publish --dry-run --access public` has no warnings.
- [ ] Docs and examples use `reflection-check` for imports.
- [ ] Sourcer dogfood confirms the improvement before the next npm release.
