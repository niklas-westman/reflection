# Text diagnostics fixtures

Two compact fixtures for the text-rendering diagnostics tests, committed so a clean checkout reproduces them offline.

| Fixture | Font | Source |
| --- | --- | --- |
| `inter-label` | Inter Medium 500 (latin subset) | live diagnostic, version unknown, caller-attested identity (mirrors a Figma outlined-source capture) |
| `lora-caption` | Lora Regular 400 (latin subset), string with `åäö` | pinned, versioned, reported identity |

Each directory holds:

- `font/*.woff` and `font/OFL.txt`: the font file served to the browser by the tests, and its license.
- `source/frame.svg` and `source/label.svg`: outlined source. Text shaped with HarfBuzz and written as `<path>` elements.
- `reference/reference.webp`: the reference image, lossless WebP. Rasterized by librsvg (through `sharp`) from `frame.svg`, so it is independent of Chromium's rasterizer, as a design tool's export is.
- `bundle.json`: the `reflection.text-source/v1` bundle with byte lengths and SHA-256 hashes.

## Licensing and provenance

Both fonts are licensed under the SIL Open Font License 1.1 (full text in each `font/OFL.txt`). The files come unmodified from the `@fontsource/inter` and `@fontsource/lora` npm packages (versions pinned in `pnpm-lock.yaml`). Inter is © The Inter Project Authors (https://github.com/rsms/inter). Lora is © The Lora Project Authors (https://github.com/cyrealtype/Lora-Cyrillic). The fonts are redistributed here under the OFL; they are used for tests only and are not part of the published package (the package ships `dist`, `docs`, `LICENSE` and `README.md`).

The SVGs, references and bundles contain no third-party design content: they are generated from the fonts and the strings above.

## Regenerating

```bash
pnpm install
node scripts/generate-text-fixtures.mjs
```

The generator needs the dev dependencies `harfbuzzjs`, `wawoff2`, `sharp` and the `@fontsource` packages. Output is deterministic; the tests fail on any hash mismatch, so a changed byte means a changed input.
