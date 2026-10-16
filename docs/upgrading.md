# Upgrading

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
