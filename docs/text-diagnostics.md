# Text-rendering diagnostics

Reflection can explain why native browser text and an independently exported design (outlined vectors) produce different pixels even when typography and geometry agree closely. The feature is **diagnostic only**.

## What it does not do

- The real implementation screenshot stays the implementation evidence, and the original reference image stays the visual oracle.
- Thresholds, visual outcomes, severities and exit codes are unchanged. A failed screenshot does not become a pass because outlines look close. A test asserts the native result, artifacts and screenshot are byte-identical with and without diagnostics.
- It grants no compliance and replaces no owner approval. Every record carries that statement.
- It adds no approve, promote, threshold-edit or "ignore text" action.
- Projects that configure nothing see no change.

## How it works

For a component visual case you point `textDiagnostics` at a **source bundle** and name the text parts to inspect. After the real screenshot and native comparison exist, Reflection, in separate browser sessions:

1. **Validates** the bundle (hashes, paths, scope, units, viewport, device scale, SVG safety) and rejects unusable input.
2. **Observes** each part at runtime: text, computed typography, geometry, baseline, transforms, loaded font faces, font files downloaded (with hashes), and the font the browser actually painted (`CSS.getPlatformFontsForNode`, not `document.fonts.check()`).
3. **Compares** supplied facts with observations and reports raw deltas and evidence completeness.
4. **Runs rendering-path experiments** where outlined SVG is supplied: the full frame rendered passively in an isolated context, and a per-part overlay on the same component state. Each is compared with the original reference and measured inside and outside the text region.
5. **Writes a record** (`reflection.text-diagnostics/v1`) with a cautious inference.

## Configuration

```ts
component: {
  storybook: { /* … */ },
  cases: [
    {
      id: 'button-refresh-dark',
      storyId: 'button--refresh',
      viewportSize: { width: 390, height: 220 },
      baselineRoot: 'design/references',
      baseline: 'button/refresh-dark.webp',
      threshold: { maxDiffPixels: 60, maxDiffPixelRatio: 0.0008 },
      textDiagnostics: {
        source: 'design/text/button-refresh-dark/bundle.json', // relative to the config file
        parts: [{ id: 'refresh-label', selector: '[data-part="label"]' }],
        context: { theme: 'dark', adapter: 'react' },          // must equal the bundle's context
        regionPadding: 2,                                       // css px around the text box, default 2
        experiments: { frameRender: true, partOverlay: true }   // both default true
      }
    }
  ]
}
```

Selectors live in your config, not in the bundle, so the bundle stays independent of any codebase. Each selector must match exactly one element. `reflection doctor` validates every configured bundle offline and prints its state.

## Source bundle (`reflection.text-source/v1`)

A JSON file plus the files it references. Everything is a plain fact supplied by whatever tool produced the source; Reflection does not depend on Figma, Marwes selectors, credentials or a paid seat.

```jsonc
{
  "schema": "reflection.text-source/v1",
  "source": {
    "id": "figma:file/frame",
    "provider": "figma",                       // optional, informational
    "scope": "live-diagnostic",                // "pinned" | "live-diagnostic"
    "capturedAt": "2026-10-15T19:57:18.075Z",
    "sourceVersion": null,                     // null = not independently known; never inferred
    "document": { "id": null, "name": "Design file" },
    "fileIdentity": {
      "reportedId": null,                      // what the tool itself reported
      "attestedId": "abc123",                  // what the caller independently verified
      "verification": "caller-attested"        // "reported" | "caller-attested" | "unknown"
    },
    "receipt": { "id": "receipt-1", "kind": "caller-attestation" },
    "exportSettings": { "outlinedText": true }
  },
  "context": { "theme": "dark", "adapter": "react" },
  "viewport": { "width": 390, "height": 220, "deviceScaleFactor": 1 },
  "reference": { "id": "reference", "role": "reference", "path": "reference.webp", "mediaType": "image/webp", "bytes": 1234, "sha256": "…" },
  "outlines": [
    { "id": "frame", "role": "outlined-source", "kind": "frame", "path": "frame.svg", "mediaType": "image/svg+xml", "bytes": 5511, "sha256": "…",
      "bounds": { "x": 0, "y": 0, "width": 390, "height": 220 } },
    { "id": "label", "role": "outlined-source", "kind": "text-outline", "path": "label.svg", "mediaType": "image/svg+xml", "bytes": 5511, "sha256": "…",
      "bounds": { "x": 179, "y": 102, "width": 48, "height": 16 }, "partIds": ["refresh-label"] }
  ],
  "parts": [
    {
      "id": "refresh-label",
      "expectedText": "Refresh",                        // the real characters, not the layer name
      "box": { "x": 179, "y": 102, "width": 48, "height": 16, "basis": "observed" },
      "baseline": { "y": 115.00003, "basis": "inferred" },   // or null
      "transform": null,                                // [a, b, c, d, e, f] or null
      "typography": {
        "family": "Instrument Sans", "postScriptName": "InstrumentSans-Medium", "size": 14, "weight": 500,
        "axes": { "wdth": 100, "wght": 500 },
        "tracking": { "unit": "percent", "value": -3 }, "lineHeight": { "unit": "px", "value": 16 },
        "direction": "ltr", "color": "#141414"
      },
      "fontAsset": { "sha256": null, "note": "Authoring-font binary not independently known." }
    }
  ]
}
```

Rules enforced on load (any failure makes the whole bundle `invalid`, and nothing from it is shown as evidence):

- Strict schema: unknown keys are errors. Artifact paths must be relative, free of `..`, and resolve (including symlinks) inside the bundle's directory.
- Every artifact's byte length and SHA-256 must match. Reference format must match its media type and its pixel size must equal `viewport × deviceScaleFactor`. Frame outlines must cover the viewport from the origin and every outline's SVG size must match its `bounds`.
- `verification: "reported"` requires a `reportedId`: an attested or expected id never replaces a null reported id.
- `sourceVersion: null`, `fontAsset.sha256: null` and `baseline: null` are explicit absences and weaken what can be claimed.
- Coordinates are CSS pixels in the reference's coordinate space (frame-relative). Fractions are preserved exactly; nothing is rounded.

### Mapping a Figma outlined-source capture

Marwes's `capture.json` (`marwes.figma-outlined-source/v1`) maps like this. The converter is the provider's job, because the engine stays provider-neutral:

| Capture | Bundle |
| --- | --- |
| `sourceScope: "live-diagnostic-observation"` | `source.scope: "live-diagnostic"` |
| `fileIdentity.reportedFileKey` / `verification: "caller-verified-file-name"` | `reportedId` / `verification: "caller-attested"` with `attestedId` from the independently verified URL |
| (no version) | `sourceVersion: null` |
| `textNodes[].characters` | `parts[].expectedText` (the layer name can differ: a layer named `Cancel` may contain `Refresh`) |
| `textNodes[].fontName`, `fontSize`, `letterSpacing`, `lineHeight` | `typography` (`PERCENT` tracking becomes `unit: "percent"`) |
| `absoluteBoundingBox` minus the frame's origin | `box` / `bounds` (frame-relative; subtract exactly, do not round) |
| exported `.svg` + `bytes`/`sha256` | `outlines[]` |

## The record

Stored at `visual/<case>/text-diagnostics/record.json` and in the check's `metadata.textDiagnostics`. The check also gets one `info` entry in `diagnostics` (`kind: "text-diagnostics"`). The report schema version is unchanged.

| Field | Meaning |
| --- | --- |
| `state` | `available`, `unsupported`, `invalid` or `error` (`not-configured` is a reserved value: unconfigured cases get no record). |
| `reasons` | Why a record is not `available`, as `{ code, message }`. |
| `nativeOutcome` | The native screenshot result, with `unchanged: true`. |
| `source` | Scope, version (or `null`), file identity, receipt. |
| `inputs` | Hashes of the bundle, reference, baseline, actual screenshot and outlines, the tool and browser versions, and `bindingKey`. |
| `runtime` | Page facts: loaded font faces, downloaded font file hashes, device pixel ratio. |
| `parts[].observations` | Per field: `source`, `runtime`, raw `delta`, `tolerance`, `comparison` (`match`/`mismatch`/`unknown`) and the basis of each side (`provided`, `observed`, `inferred`, `computed-style`, `cdp-platform-fonts`, `unavailable`). |
| `parts[].evidence` | `complete` and the list of missing facts. |
| `experiments` | Each experiment's state, artifacts and measurement (`totalDiffPixels`, `regionDiffPixels`, `outsideRegionDiffPixels`, plus the same region measured on the native screenshot). |
| `inference` | See below. |
| `artifacts` | Explicit roles: `reference-image`, `implementation-screenshot`, `native-diff`, `source-outline`, `diagnostic-render`, `comparison-image`, with path, SHA-256 and bytes. Roles are written by Reflection, never guessed from filenames. |
| `conversions` | Every coordinate or unit conversion applied. |
| `limitations`, `shaping` | Fixed limitations, and `shaping.state: "unsupported"`. |

### Inference

An inference is a cautious reading of the evidence, never a verdict.

| `inference.id` | When |
| --- | --- |
| `native-text-vector-rendering-discrepancy-suspected` | All typography and geometry observations match within tolerance, the font identity does not mismatch, the native screenshot did not pass, and a rendering-path experiment differs from the reference in less than half the pixels the native screenshot does. `confidence` is `moderate` only for a pinned, versioned source with complete evidence, otherwise `low`. |
| `typography-or-geometry-mismatch-observed` | Any observation mismatches (wrong text, size, weight, tracking, line height, colour, direction, box, baseline, transform). The rendering-path explanation is withheld, however good an experiment looks. |
| `font-identity-mismatch-observed` | The browser painted the text with a different font than the source names (fallback or substitution). |
| `native-screenshot-passed` | Nothing to explain. |
| `insufficient-evidence` | A selector did not match exactly one element, no experiment produced a measurement, or the experiment did not clearly help. |

Tolerances: 0.01 css px for typography, 0.05 css px for box geometry, and 0.5 css px for the baseline, because Chromium rounds a font's ascent and descent to whole pixels. Raw deltas are always reported unrounded.

## The experiments

Both render outlines **passively**: as an image, with JavaScript off for the frame render and no network, so the SVG's own markup is never executed or allowed to fetch anything.

- **frame-render**: the complete outlined frame in an isolated context, compared with the reference. It explains how much of the difference comes from the vector rendering path itself.
- **part-overlay**: in a separate session on the same component state (framing and forced hover/focus included), the part's native text is made transparent and the outlined source is placed at its source coordinates as an SVG `<image>` with fractional `x`/`y`, avoiding CSS layout's 1/64 px snapping. This diagnostic render does **not** depend on the component's real text, which is why observations and the inference gate, not the render, decide whether a rendering-path claim is made.

Neither render is implementation evidence or a replacement baseline, and region measurements split the count by location without masking any pixel from the native comparison.

## SVG safety

SVGs and metadata are untrusted. Inspection runs before any render:

- Rejected as `invalid`: `<script>`, `<foreignObject>`, animation elements, `<style>`, `<a>`, `<iframe>`/`<object>`/`<embed>` and similar; event-handler attributes; any `href` that is not a same-document `#fragment`; any `url()` that is not a fragment; `data:`, `javascript:`, `@import` and `expression()` in values; DOCTYPE, entities, CDATA and processing instructions (rejected before parsing, so no entity or external subset is ever expanded); malformed XML.
- Reported as `unsupported`: live `<text>` (the source must be outlined), `<image>`, `<filter>`, `<pattern>`, `<marker>`, `<symbol>` and other elements the passive renderer does not model. They are named, never silently omitted.
- Bounds: 2 MiB per SVG, 8 MiB per bundle, 50,000 elements, depth 64, 1,000,000 path-data characters, 16,384 px per side, 1 MiB for the bundle file, 16 MiB for the reference.
- The report never reads arbitrary paths: only artifacts that are attached to the check are rendered as images in the HTML report.

## The HTML report

`report.html` shows a separate **Text diagnostics** panel on a check that has a record: the unchanged native result first, then state, source scope and identity badges (`live, unversioned source`, `source version unknown`, `identity: caller-attested`), the inference with its limitations, the images with role labels, the observation table (inferred facts are labelled), the experiments and the binding key. Rejected input shows only its reasons. Every value is escaped and image paths are restricted to the check's own artifacts.

## Freshness

`inputs.bindingKey` hashes the run and case identity with every input: bundle, reference, baseline and actual screenshot hashes, outlines, parts and selectors, context, viewport, tool and browser versions. Treat a record as stale when its key differs from the one you expect, and never carry a record from an older run onto a newer one. A run with no latest record for a case has no diagnostic evidence for it.

## Limitations

- No full-string shaping or glyph-outline comparison (`shaping.state: "unsupported"`). This release does not claim glyph-level similarity of any kind.
- Observations compare facts supplied by the source with one browser on one platform. They do not prove font-binary identity; the downloaded font file's hash is recorded, but which file painted the text is not established.
- Component cases only, at device scale 1.
- A rendering-path inference does not generalize to other strings, fonts, browsers or platforms.

## For consumers (UI)

The record is additive and versioned (`reflection.text-diagnostics/v1`); the report schema is unchanged. A UI should show the native result prominently, keep reference, real capture and native diff side by side, show diagnostic material in a separate panel with its labels, and keep whole-family gaps and denominators visible. This package ships the HTML report panel only; an interactive inspector builds on the record and its explicit artifact roles.

## Fixtures and regenerating them

`tests/fixtures/text-diagnostics/` holds two compact fixtures (Inter, a live unversioned caller-attested source, and Lora with Unicode, a pinned versioned source) with OFL-licensed fonts, outlines shaped with HarfBuzz, and a reference rasterized by librsvg via `sharp` (independent of Chromium). Regenerate with `node scripts/generate-text-fixtures.mjs`; the output is byte-identical. See the fixture README for provenance and licensing.
