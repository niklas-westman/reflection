# Component capture policy: Pressed state and animation stabilization

A component visual case can declare **how its state is established** and **how motion is made repeatable**, independently of each other. Both apply to the native screenshot, to runtime probes and to text-diagnostic sessions through one code path, are recorded in the report, and are hashed so a policy change is recognisable. Cases that declare neither behave exactly as before.

Neither feature changes thresholds, comparison behavior, PNG/WebP handling, severities or exit codes.

## Pressed: a genuine held pointer-down

```ts
{
  id: 'button-pressed',
  storyId: 'button--primary',
  baseline: 'components/button/pressed.webp',
  browserState: { kind: 'pressed', selector: '[data-part="root"]' },
  stabilization: { animations: 'none' }
}
```

Reflection:

1. Resolves the target and checks it is usable: exactly one match, visible, enabled, with a rendered box, and the pointer position inside the viewport.
2. Hit-tests the pointer position. The element under the pointer must be the target **or one of its descendants** (pressing a label or icon inside a button is a press of the button). An overlay, or `pointer-events: none`, fails explicitly instead of pressing something else.
3. Moves the real pointer there and holds the primary mouse button down (real browser input, not a class or attribute).
4. Verifies the target matches `:active` before capturing. A page that does not get an active state fails; a screenshot is never taken as if it had.
5. Captures (probes and screenshot) while the pointer is still down.
6. Releases on success and on failure. The pointer first moves off the target, so the target's own click handler is not activated. A `click` may still be dispatched to a common ancestor, so a document-level delegated click handler could observe it after the capture.

A real press also hovers and focuses the target, so Pressed captures show `:hover` and `:focus` effects as a user would see them. `position` (fractions of the target box, default centre) chooses where the pointer lands; it applies to `hover` and `pressed`.

When the state cannot be established the case **fails explicitly** with `classification: "capture-state-not-established"`, a `captureError.code` and its evidence, and no screenshot is substituted (the check carries only the expected artifact):

| `captureError.code` | Cause |
| --- | --- |
| `target-not-found` / `target-not-unique` | The selector matched zero or several elements. |
| `target-not-visible` / `target-disabled` / `target-no-box` | The target is hidden, disabled or has no box. |
| `target-outside-viewport` | The pointer position lies outside the viewport. |
| `target-obscured` | Another element is under the pointer, or the target has `pointer-events: none`. |
| `active-state-not-established` | The target was not `:active` while the button was held. |

A screenshot does not prove activation *behavior*: Pressed capture shows the active appearance only. Assert what pressing does with a separate behavior test.

Hover and Focus keep their existing behavior (`locator.hover()` and `locator.focus()`), now also recording `matchesHover` / `focused` as evidence without adding a failure mode.

## Stabilization: repeatable captures without an interaction

```ts
stabilization: {
  animations: 'none' | 'settle',   // required
  settleMs: 0,                     // optional extra wait after the interaction, max 5000
  verify: true,                    // default true
  verifyDelayMs: 100               // default 100, max 2000
}
```

It works for default, disabled and loading cases with no `browserState`: you do not need to invent a Hover or Focus state to freeze a fixture.

| `animations` | What happens | Semantics |
| --- | --- | --- |
| `none` | A stylesheet sets `animation: none; transition: none`, installed **before** any interaction so a forced state applies instantly. | CSS animations and transitions disappear and elements render in their **un-animated base style**, a deterministic "phase zero". A finite entrance animation therefore shows its starting style, not its end state. Does not control Web Animations, canvas, video, `requestAnimationFrame` or timers. |
| `settle` | After the interaction, every Web Animation (CSS animations, CSS transitions and `element.animate()`, including pseudo-elements and open shadow roots) is driven to a deterministic state: **finite animations are finished to their end state, infinite ones are cancelled to their un-animated state**. Up to five passes, because finishing one can start another. | Fails (`animations-still-running`) if animations are still running afterwards. Does not control canvas, video, `requestAnimationFrame` or timers. |

Order of operations: fixture readiness and framing, then (`none`) the stylesheet, then the interaction, then (`settle`) the settle passes, then `settleMs`, then probes and the screenshot.

### Verification

With `verify` on (the default), the native capture is taken twice, `verifyDelayMs` apart, and the pixels must be identical. This is how motion the policy cannot control (canvas, video, `requestAnimationFrame` loops, JavaScript timers) is noticed: the case fails explicitly with `classification: "capture-stabilization-failed"`, `captureError.code: "capture-unstable"` and the differing pixel count, rather than recording an arbitrary phase. Set `verify: false` to opt out deliberately; the report records that.

Verification applies to the native capture. Diagnostic sessions apply the same state-establishing steps; they do not repeat the check.

### What this is not

- It is **visual** stabilization only. It does not test that an animation works. Keep real motion assertions in behavior tests against the unstabilized component, which this policy never touches: the policy lives only in the capture's own browser context.
- It does not make an arbitrary animation phase authoritative. The reference supplies the intended appearance.
- It does not mask text or pixels, and a geometry, colour or text defect still fails the unchanged threshold.
- It will not stop a loop that draws every frame (canvas) or moves things from script. Verification reports those.

### Legacy `animationStabilization`

`browserState.animationStabilization` (`disableAnimations`, `waitMs`) keeps working exactly as before and counts as the effective stabilization for hover and focus. It maps to `css-none` (or `wait-only` when `disableAnimations: false`), applies no verification, and is reported as `source: "browser-state"`. If a case declares both, the case-level `stabilization` wins.

## Reported evidence

When a case declares an interaction or stabilization, the check carries (additively):

- `metadata.capturePolicy`: `{ version, interaction, stabilization, hash }`, the effective policy and a SHA-256 of it.
- `metadata.captureOutcome`: what was established: the interaction evidence (for Pressed: pointer position, target box, the element hit, `matchesActive`, `matchesHover`, focus), what stabilization did (method, finished/cancelled/still-running counts), the verification result and the release result.
- On failure, `metadata.captureError` (`code`, `classification`, `evidence`) and a `component-capture-state-error` diagnostic.

Unconfigured cases add none of these.

### Evidence identity and freshness

- `capturePolicy.hash` identifies the policy. Treat evidence captured under a different hash as captured under a different policy; do not let an older-policy result stand as current.
- Text diagnostics include the policy in their `inputs.capture`, so `inputs.bindingKey` changes whenever the policy changes. Their records show the policy applied to the native capture and to the diagnostic session (`runtime.capture`, `equivalence: "identical-policy"`).
- Native and diagnostic captures use the same code to open and prepare the component, so probes, the native screenshot and diagnostic experiments describe one state. Case, adapter, theme, viewport and run boundaries are unchanged.

## Limitations

- Pressed uses the primary mouse button only; touch and keyboard activation are not simulated.
- `none` and `settle` cannot stabilize canvas, video, `requestAnimationFrame` loops or JavaScript timers; verification reports them as unstable.
- Verification compares two captures a short delay apart, so very slow motion can pass it. Use `verifyDelayMs` to widen the window.
- A press can dispatch a `click` to a common ancestor on release (see above).
- Chromium only, as for the rest of Reflection's component capture.
