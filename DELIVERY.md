# Reflection delivery handoff

This repo is **Reflection**: a local-first CLI for evidence-backed rendered UI validation. It is meant to let humans, agents, and CI answer:

```text
Does the UI still work?
Does it still match the design/system contract?
Did anything visible change unexpectedly?
```

Current branch state at handoff:

```text
main
cdf9710 [verified] Add documentation pass
```

The tree was clean before this `DELIVERY.md` was added for handoff packaging.

---

## How to understand the project quickly

Start here, in this order:

1. `README.md` — high-level product purpose and docs index.
2. `docs/plans/reflection-implementation-plan.md` — implementation roadmap and completed phase evidence.
3. `docs/getting-started.md` — current manual setup flow for a consuming repo.
4. `docs/configuration.md` — supported `reflection.config.ts` shape.
5. `docs/browser-contract.md` — route/browser expectations and screenshot evidence.
6. `docs/visual-contract.md` — visual smoke/component baseline behavior and update policy.
7. `docs/artifacts-and-gc.md` — report bundle layout and safe garbage collection.
8. `docs/agent-workflows.md` — how agents should run and report Reflection.
9. `docs/validation-process.md` — canonical agent/CI operating guide.
10. `docs/ci.md` — CI defaults and exit-code behavior.
11. `docs/target-ir-and-adapters.md` — Target IR and optional adapter seam.

Important source paths:

- `src/cli.ts` — CLI command registration.
- `src/commands/run.ts` — main validation run orchestration.
- `src/commands/review.ts` — summary/report review command.
- `src/commands/update.ts` — explicit baseline update command.
- `src/commands/gc.ts` — artifact garbage collection command.
- `src/core/config.ts` — config schema/load/validation.
- `src/core/define-reflection.ts` — typed config helper.
- `src/index.ts` — public package root export.
- `src/core/server-manager.ts` — starts/reuses target dev server.
- `src/core/artifact-store.ts` — run artifact paths and safety.
- `src/core/report-schema.ts` — machine-readable report shape.
- `src/core/target-ir.ts` — normalized target IR.
- `src/adapters/route-manifest.ts` — proof adapter from JSON route manifest to Target IR.
- `src/contracts/browser/browser-contract.ts` — Playwright browser route checks.
- `src/contracts/component/component-visual-contract.ts` — Storybook component visual checks.
- `src/contracts/design/design-contract.ts` — project-owned design command checks.
- `examples/basic-react/reflection.config.ts` — current in-repo fixture config.
- `tests/` — unit/integration/e2e coverage.

---

## Current completed roadmap state

Completed and committed phases include:

- Day 1: skeleton, CLI extraction, config schema, report/artifact pipeline, fixture app, server manager, browser runner.
- Day 2: DOM/layout/console browser assertions and report classifications.
- Day 3: screenshot capture, baseline compare, route visual smoke, explicit baseline update.
- Day 4: review command, CI mode, artifact GC safety.
- Day 5: design command adapter, Storybook component visual contract, pseudo-state policy.
- Day 6: Target IR and optional route manifest adapter proof.
- Day 7.1: documentation pass and public package root export.

Most recent verified commit:

```text
cdf9710 [verified] Add documentation pass
```

Validation at that commit passed:

```bash
corepack pnpm exec vitest run tests/unit/package-surface.test.ts tests/unit/config.test.ts
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
git diff --check --cached
```

Final independent review passed with no security concerns or logic errors.

---

## What is left on the roadmap

The original roadmap has one explicit remaining phase:

### Phase 7.2 — Dogfood decision gate

Original acceptance checklist from `docs/plans/reflection-implementation-plan.md`:

- `reflection run` works locally against `examples/basic-react`.
- Browser contract catches route/layout/console failures.
- Reports are understandable without raw logs.
- Agents can parse `report.json` and identify next steps.
- GC cannot delete baselines or unrelated files.
- Visual strictness remains opt-in.
- No public names contain `greenhouse`.

A practical gate was run against `examples/basic-react` and behaved correctly: it built, `doctor` ran, and `run` failed on the intentional overflow and console-error fixture routes. `review --json` produced agent-readable blocking failures and artifact paths.

However, before real-project dogfooding, Niklas identified the cleaner delivery model:

> Make Reflection behave like a normal npm package, similar to Greenhouse Spec, so consuming projects install it and import `defineReflection` from the package root.

So the recommended remaining roadmap should be split into two concrete phases:

---

## Next phase: Phase 7.2A — Package-install dogfood readiness

Goal: prove Reflection works as an installable npm-style package from a consuming project, not through absolute paths into this repo.

### Acceptance criteria

1. Reflection can be packed locally:

   ```bash
   pnpm pack
   ```

2. A temporary consuming project can install the tarball:

   ```bash
   pnpm add -D /absolute/path/to/reflection-check-0.0.1.tgz
   ```

3. The consuming project can write a config using the package root import:

   ```ts
   import { defineReflection } from 'reflection-check';

   export default defineReflection({
     project: 'consumer-app',
     contracts: {
       browser: {
         baseUrl: 'http://127.0.0.1:5173',
         server: {
           command: 'pnpm dev --host 127.0.0.1',
           readyUrl: 'http://127.0.0.1:5173',
           reuseExisting: true,
           timeoutMs: 60_000
         },
         routes: [
           {
             id: 'home',
             path: '/',
             viewports: ['desktop', 'mobile'],
             expects: [
               { role: 'heading', name: 'Home' },
               { noHorizontalOverflow: true },
               { noConsoleErrors: true },
               { screenshot: 'final' }
             ]
           }
         ]
       }
     }
   });
   ```

4. The consuming project can run the package binary:

   ```bash
   pnpm exec reflection doctor --config reflection.config.ts
   pnpm exec reflection run --config reflection.config.ts --mode smoke
   pnpm exec reflection review --json
   ```

5. Docs make package install the primary dogfood path instead of source-repo execution.

6. Add tests/smokes proving package metadata is correct:

   - package root exports `defineReflection`.
   - package root exports config types.
   - `bin.reflection` and `bin.reflection-check` point at `dist/cli.js`.
   - package tarball contains `dist`, docs, LICENSE, README, and package metadata.
   - tarball install smoke can import `defineReflection` from `reflection-check`.

### Likely files to modify

- `package.json`
  - Keep the public package name as `reflection-check`.
  - Keep `main`, `types`, `exports`, and `bin` aligned with `dist` output.
  - Keep runtime dependencies in `dependencies`; `playwright` must be available in a consuming install.
  - Keep `publishConfig.access` set to `public` for npm publishing.
- `src/index.ts`
  - Keep the public package surface minimal.
  - Export only `defineReflection` and stable config types unless more public API is intentionally needed.
- `tests/unit/package-surface.test.ts`
  - Extend to cover final package metadata expectations.
- Possibly new test/smoke script under `tests/e2e/` or `scripts/`
  - Creates a temp consumer, installs packed tarball, imports config helper, runs `pnpm exec reflection`.
- `docs/getting-started.md`
  - Make package install the primary path.
- `docs/configuration.md`
  - Keep `import { defineReflection } from 'reflection-check'` as the canonical config import.
- `docs/agent-workflows.md`
  - Use `pnpm exec reflection ...` for consuming repos.
- `docs/validation-process.md`
  - Clarify local repo development vs installed package workflow.
- `docs/plans/reflection-implementation-plan.md`
  - Add Phase 7.2A evidence when complete.

### Important nuance

Reflection should **not silently install the target project** during `reflection run`.

The clean model is:

```bash
pnpm install
pnpm exec reflection run --config reflection.config.ts --mode smoke
pnpm exec reflection review --json
```

The target project owns dependency installation through its package manager. Reflection is a dev tool installed into that project, like Vitest, Playwright, or Greenhouse Spec.

A future `doctor --config` can become smarter and report missing setup, but `run` should stay an evidence command, not an implicit dependency mutator.

---

## Following phase: Phase 7.3 — Real-project dogfood

Goal: run Reflection against one real project through the installed package model.

### Recommended target shape

Pick a React/Vite app with:

- stable install command;
- stable dev server command;
- 2–4 routes;
- at least one mobile viewport;
- at least one useful `noConsoleErrors` check;
- at least one useful `noHorizontalOverflow` check;
- optionally one route-level `visualSmoke` baseline.

### Acceptance criteria

1. Target repo installs Reflection as dev dependency, initially from packed tarball if unpublished:

   ```bash
   pnpm add -D /path/to/reflection-check-0.0.1.tgz
   ```

2. Target repo has `reflection.config.ts` using:

   ```ts
   import { defineReflection } from 'reflection-check';
   ```

3. Target repo can run:

   ```bash
   pnpm exec reflection run --config reflection.config.ts --mode smoke
   pnpm exec reflection review --json
   ```

4. Agent can summarize:

   - status;
   - blocking failures;
   - review items;
   - report path;
   - artifact paths;
   - whether any baseline update is dry-run-only or human-approved.

5. Decide after dogfood whether next hardening should be:

   - smarter `doctor --config` preflight;
   - package publishing/scoping;
   - CI template;
   - component baseline promotion;
   - richer report UX;
   - official integration with an upstream spec system.

---

## Known limitations to preserve honestly

Do not claim these are solved yet:

- Reflection is not published as a public package yet.
- Real consuming repos should be installed before running Reflection.
- `doctor` is currently lightweight; configured project checks happen through `run --config`.
- CLI `--mode` selects the run mode; config-defined default/CI mode behavior is not wired.
- `reflection update` currently promotes route-level `visualSmoke` baselines only.
- Component visual baseline promotion is manual for now.
- `manifest.json` currently tracks report files for retention; runtime evidence still belongs to the run bundle but is not fully enumerated there.

---

## Local setup after downloading this archive

From the unzipped repo root:

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
```

Run the current fixture validation:

```bash
node dist/cli.js doctor
node dist/cli.js run --config examples/basic-react/reflection.config.ts --mode smoke --report-dir /tmp/reflection-fixture-run || true
node dist/cli.js review --report-dir /tmp/reflection-fixture-run --json
```

The current fixture intentionally contains failing routes (`overflow` and `console-error`) so a fail status there is expected and useful.

---

## Suggested first command for the next agent

```bash
cd /path/to/reflection
git status --short --branch
read docs/plans/reflection-implementation-plan.md around Phase 7.2
pnpm build
pnpm pack
```

Then implement **Phase 7.2A — Package-install dogfood readiness** with TDD and independent review before committing.
