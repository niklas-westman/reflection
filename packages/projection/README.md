# reflection-projection

The neutral contract between a project that proves a design against its implementation and anything that shows the result: reflection-check-ui, the release portal, a CLI. It is private for now and has no knowledge of Figma, Penpot, a component framework or Discord.

A provider turns its own evidence into a `Projection`. The reader never needs to know where it came from.

## What is in a projection

| Part | What it says |
| --- | --- |
| `requirements` | Everything that must be proven, whether or not a comparison exists. Readiness is derived, never stored |
| `comparisons` | One check of a design reference against a rendered result: proof per layer, artifacts with roles and hashes, a `verdict`, optional measurements, the reference approval |
| `snapshots` | The design data something was proven against. Several can coexist, so a full sync date never hides an older proof-source date |
| `runs` | Engine, runner, `inputs[]` and result hashes, so validity can be computed when the evidence is read |
| `decisions` | Human decisions, bound to content (verdicts, reference hashes, capture policies, the required set), never to a run |
| `release`, `delta` | The release manifest and what changed since the previous release |

## Rules the schema enforces

- **Five signals stay separate:** proof (`passed`, `failed`, `not-run`, `unsupported`), readiness (derived), validity (computed on read), reference approval, review (decisions).
- **Coverage never appears in proof.** A required layer that is `not-run` or `unsupported` can never make a requirement `proven`.
- **A bucket the provider has no concept of is `null`, never 0.** `required` always equals the sum of the buckets.
- **An approval that holds or lapsed says who recorded it** (`human` or `agent`). Only a legacy reference approval may be agent-recorded.
- **Artifact paths are relative** and may not contain `..`.
- **Ids are unique and every reference resolves** (requirement, run, snapshot, decision).

## Functions

- `deriveReadiness`, `summarizeReadiness`, `summarizeProjection`: the one place readiness is counted.
- `computeValidity(recorded, current)`: `current`, `stale` with the exact changed inputs, `invalid`, `never-run` or `offline`. Pure. The caller hashes the current inputs with the engine's `hashReportInputs`.
- `buildDecisionBinding`, `evaluateDecision`: `holds`, `carried-forward` (identical results on a rebuilt bundle), `lapsed` with named causes, or `withdrawn`.
- `projectFromReflectionReport`: the native provider. The engine cannot declare required items, so its inventory is `executed-only` and coverage is a lower bound.

## Bundles

A release is published as an immutable bundle: `manifest.json` (project, release, generator, every file's path, kind, sha256 and size, and a `bundleHash` over all of them), `projection.json` (the entry), the artifacts it points at, and optional `source/` and `analysis` files. Paths are relative with `/` separators; only images and text are allowed (no SVG or HTML), and `_raw` content is refused.

- `openBundle(source, { verifyFiles })` reads a bundle from any `BundleSource` (a directory, an HTTP origin, memory) and never throws for bad content. A bundle that cannot be trusted as a whole comes back `rejected` (missing or invalid manifest, unsupported schema version, changed manifest or projection, wrong project). One with a missing, unreadable, tampered or undeclared file comes back `opened` with `problems` and `unusablePaths`, so the inventory stays visible and only that evidence is withheld. `toIntegrityFailures` feeds `computeValidity`.
- `verifyBundleFile` reads one declared file and checks its hash; a viewer calls it when it loads an image.
- `writeBundle` and `createDirectorySource` are Node-only and live in `reflection-projection/node`. The writer streams files, fills in missing artifact hashes, refuses to overwrite, refuses text that holds a local path or an obvious credential, and renames a finished temporary directory into place.
- `foldNotes`, `countNotes` and `noteEventSchema`: per-family notes as an append-only event log (added, resolved, retracted). A note never changes an outcome.
- `buildArchiveSummary` and `archiveSummarySchema`: what remains after a release leaves its slot (counts, decision, snapshot dates, notes at exit).

Writing a provider: see [docs/provider-guide.md](docs/provider-guide.md).

## Conventions

Property names are camelCase, matching the engine's report. Ids, enum values, file and folder names are kebab-case (`needs-design`, `changes-required`, `canonical-json`).

## JSON Schema

`schema/projection.v1.schema.json` is generated from the Zod schema (`pnpm schema`) so providers in other repositories can validate without importing this package. It covers structure only. Integrity rules (unique ids, resolving references, relative paths, decision rules) need the Zod schema. A test fails if the committed file drifts from the Zod schema.

## Fixtures

`tests/fixtures` holds four shapes: a real native report from `examples/basic-react`, real Marwes Button and Sourcer Login samples mapped from evidence, and an independent project (screenshots, browsers as adapters). The Marwes and Sourcer samples carry only the comparisons and requirements that were really read. The test builder adds clearly named `placeholder/` requirements to reach their real totals (273 and 30), so the counts can be asserted without inventing detail.
