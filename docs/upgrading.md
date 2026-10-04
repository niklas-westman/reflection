# Upgrading

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
