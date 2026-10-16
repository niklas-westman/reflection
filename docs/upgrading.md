# Upgrading

## 0.5.x to 0.6.0

No breaking changes. Cases that declare neither a `pressed` state nor `stabilization` are captured exactly as before, with the same metadata, artifacts, thresholds and exit codes.

- **Pressed.** `browserState.kind` now accepts `pressed`, a genuine held pointer-down (`docs/capture-policy.md`). Cases that were `unsupported` for Pressed can be enrolled with `browserState: { kind: 'pressed', selector }` and a `stabilization` policy. An unusable target fails the case explicitly; nothing is captured as a substitute.
- **Stabilization without an interaction.** New case-level `stabilization: { animations: 'none' | 'settle', settleMs?, verify?, verifyDelayMs? }` works on default, disabled and loading cases. Opt in per case; there is no global default.
- **`verify` is on by default** for the new policy: the capture is taken twice and must be identical, otherwise the case fails with `capture-stabilization-failed`. This can fail a case that passes today only if you opt in to `stabilization` and the page has motion the policy cannot control. Set `verify: false` to opt out explicitly.
- **`browserState.animationStabilization` is now optional** when the case has `stabilization`. Existing hover and focus configs are valid and behave exactly as before (no verification, `css-none`, source `browser-state`).
- **Additive metadata.** Cases that declare a policy gain `metadata.capturePolicy` (with a `hash`) and `metadata.captureOutcome`; failures gain `metadata.captureError`. Evidence captured under a different `capturePolicy.hash` was captured under a different policy and should not be carried forward.
- **Text diagnostics** apply the same policy to their sessions and add `inputs.capture` and `runtime.capture` to the record. The record schema id is unchanged. `inputs.bindingKey` now also covers the policy, so keys differ from any computed before this release (the tool version is already part of the key, and cases with no policy now include `capture: null`).
- Existing configs need no changes. To adopt, replace a Pressed-unsupported enrolment with a `pressed` browser state, add `stabilization` to animated default or loading cases, and rerun. Reference images and thresholds are unaffected.

## 0.5.0 to 0.5.1

Corrects how `font.identity` is judged. No config changes, and the record schema id is unchanged (`reflection.text-diagnostics/v1`).

- **Behaviour change.** In 0.5.0, when the source had no PostScript name, the painted font's internal family name was compared with the source family as plain strings. A correctly loaded web font whose internal name carries its style (`Instrument Sans Medium` against the CSS and source family `Instrument Sans`) was reported as `font.identity: mismatch` and `font-identity-mismatch-observed`. 0.5.1 grades the comparison (`docs/text-diagnostics.md`, "Font identity"): a style-qualified alias built from the source's own style is a `match`, an unrelated web-font name is `unknown` with raw names, and a browser-reported system fallback, a conflicting style, a conflicting PostScript name and mixed-script fallback remain `mismatch`.
- **Additive record fields.** An observation may now carry `classification` and `detail` (the evidence examined). `source` on a `font.identity` observation also reports `style`. Consumers that read only `comparison`, `note`, `source` and `runtime` keep working; their values can differ from 0.5.0 for the alias case above.
- **Re-run diagnostics** produced by 0.5.0 that reported `font-identity-mismatch-observed` solely because of this naming: the new records replace them. Binding keys include the tool version, so older records are recognisably older.
- Native screenshot outcomes, artifacts, thresholds and exit codes are unchanged.

## 0.4.x to 0.5.0

No breaking changes. Projects that do not configure `textDiagnostics` get identical results, thresholds and exit codes.

- New optional `textDiagnostics` on component visual cases, a new `reflection.text-source/v1` bundle format and a `reflection.text-diagnostics/v1` record. See `docs/text-diagnostics.md`.
- The record is stored in a check's `metadata.textDiagnostics` and in `visual/<case>/text-diagnostics/`. The report schema version is unchanged, and the check gains one `info` entry in `diagnostics`.
- `report.html` gains a "Text diagnostics" panel on checks that carry a record.
- `reflection doctor` validates configured bundles offline.
- The package now depends on `fast-xml-parser` (bounded, passive SVG inspection).
- Diagnostics are diagnostic only: they never change a check's status, severity or the process exit code, and they grant no compliance.

## 0.3.x to 0.4.0

No breaking changes. Existing PNG baselines and configs work as before.

- Baselines can be lossless WebP (see `docs/visual-contract.md`, "Baseline image formats"). To convert existing PNG baselines without changing a pixel: `sharp(file).webp({ lossless: true })` or `cwebp -lossless in.png -o out.webp`, then point `baseline` at the `.webp` path.
- `reflection update` now writes lossless WebP when the baseline path ends in `.webp`.
- The package now depends on `sharp` for WebP decoding, which adds prebuilt native binaries to installs.
- Visual check metadata gains `expectedFormat` (`png`, `webp-lossless` or `webp-lossy`).

## 0.2.x to 0.3.0

0.3.0 tightens validation and matching so configs cannot pass for the wrong reason. Run `reflection doctor --config <path>` after upgrading; it reports every problem with its path.

### Breaking changes

1. **Unknown config keys are errors.** Misspelled or unsupported keys used to be silently dropped (a state `setup` was accepted and ignored in 0.2.0). Remove or fix the key named in the error.
2. **`role` and `label` match exactly.** Expectations and step targets such as `{ role: 'button', name: 'Sign in' }` or `{ label: 'Password' }` now require the full, case-sensitive name. If you relied on a partial match, write the real name or add `exact: false`.
3. **`role`, `label` and `text` expectations must be visible.** A match that exists only in hidden elements no longer passes. Add `visible: false` where hidden matches are intended.
4. **Mask lists add up across levels** (browser, route, state), and entries may be `{ selector, reason }`. Existing string lists keep working.

### New in 0.3.0

- `states[].setup`: state-specific network stubs, clock, locale, storage and so on.
- `states[].path`: a state can start at its own URL (deep links).
- `exact`, `visible` and `enabled` options on expectations; `exact` on step targets.
- Report evidence: `finalUrl`, per-expectation results and `masks` in each browser check's metadata.
- `maskSelectors` on routes and states, with optional reasons.

Details: `docs/browser-contract.md`.
