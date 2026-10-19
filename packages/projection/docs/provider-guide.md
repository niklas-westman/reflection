# Provider guide

For anyone writing the code that turns a project's own evidence into a Reflection projection and publishes it as a bundle. Marwes (Figma) and Sourcer (Penpot) are the first two providers. Read the [README](../README.md) first for what a projection holds; this guide says what a provider must do with it and what it must never do.

A provider lives in the project it describes, not in Reflection. Reflection never learns about Figma, Penpot, a component framework or Discord.

## What a provider produces

1. A `Projection` (validated by `projectionSchema`) with requirements, comparisons, snapshots and runs.
2. The files it points at: comparison images, plus optionally an archived copy of the design inventory.
3. An immutable bundle that holds both, written with `writeBundle` from `reflection-projection/node`.

A provider can run without the engine's report: Marwes and Sourcer read their own evidence. A project that uses `reflection-check` directly needs no provider; `projectFromReflectionReport` covers it.

## The five signals

Each signal answers one question. A provider fills them separately, and a view never merges them into one badge or number.

| Signal | Question | Where it lives |
| --- | --- | --- |
| Proof | What did each check find? | `comparison.proof` per layer: `passed`, `failed`, `not-run`, `unsupported` |
| Readiness | Is each required item covered and proven? | Derived by `deriveReadiness`; never stored |
| Validity | Does the evidence still match its inputs? | Computed on read by `computeValidity`, from `run.inputs` |
| Reference approval | Is the design export the approved truth? | `comparison.reference.approval` |
| Review | Did a human accept this release? | `decisions`, written by the portal, not by a provider |

## Requirements

A requirement is something that must be proven, whether or not anything has run for it.

- **Declare every required item you know about**, including ones with no design or no test yet. Set `inventory: 'full'`. A provider that only lists what ran must say `'executed-only'`, and the UI then shows its coverage as a lower bound.
- `id` is stable across runs and builds. Use a logical key (`button/primary/medium/hover/light`), never a transient node id or a run id. A decision binds to these ids, so an id that changes lapses every decision.
- `enrolled: false` means a comparison is not set up yet. `design.availability` is `missing` (no design exists) or `unmapped` (one may exist but is not linked to this requirement).
- Put dimensions in `subject` (`variant`, `mode`, `adapter`, `viewport`, `state`) and the rest in `subject.dimensions`. The UI groups and filters by these without knowing what they mean.
- `requiredProofs` lists the layers that must pass before the item counts as proven. A layer that is `not-run` or `unsupported` can never count as a pass.

### Readiness concepts

`provider.readinessConcepts` says which buckets your project has an idea of. If your project has no notion of "needs design" or "not enrolled", set that flag to `false`: the summary then reports `null` (unknown) for it, which the UI renders as unknown. **Never report an unknown bucket as 0.** A zero says "we checked and there are none".

Every number a view shows must come from `summarizeProjection`. Do not add your own counts.

## Comparisons

One comparison is one check of a reference against a rendered result.

- `requirementId` joins it to its requirement by exact identity. Do not join by name or position.
- Set the proof of each layer you actually ran. Leave a layer absent if you have no concept of it.
- `verdict` is what the engine or tool reported, in its own words: `status`, `severity`, `failureClass`. A decision binds to these three fields, so keep them free of anything that differs between identical runs (timestamps, run ids, paths).
- **Never forward a folded word.** If your tool folds coverage gaps into every case outcome (Marwes reports `blocked` for all 573 rows because coverage gaps are folded in), do not copy that word into `verdict` or `proof`. Map the real per-layer result. Keep the tool's own word in `nativeOutcome` if you want it shown as "native".
- `limitations` is where to say what a check could not do.
- Record `capturePolicyHash` when the capture settings affect the result. Evidence under another policy is not comparable.
- Record `reference.baselineSha256` (the hash of the approved baseline file) when you have it. Otherwise the artifact hash is used.

### Reference approval

`reference.approval.state` is `holds`, `lapsed` or `none`, and any state other than `none` must say who recorded it with `attestation`.

- `human`: a person approved this reference.
- `agent`: an agent or script recorded it. **An agent-recorded approval is shown as such.** It is allowed only to import a legacy record (Sourcer's `approvals.json`), and it counts as reference approval only until a person re-confirms it.

A provider never invents an approval and never upgrades an agent record to a human one.

## Snapshots and dates

A snapshot is the design data something was proven against. Reflection does not interpret `kind` or `role`; you supply them, and the UI shows your labels.

- Emit **one snapshot per thing that has its own date**. Marwes has three: the full file sync, the per-family source capture the structural proof read, and the coverage contract. Keep them separate; never merge their dates.
- A comparison names the snapshot that actually backed it (`snapshotId`), not the newest one you have. The UI says "proof based on" that date and shows the global sync as context.
- `fileKey` is the upstream file the snapshot came from. `originalFileKey` is the file it was copied from, if each snapshot is a copy (Marwes copies the Figma project on every sync).
- `release.snapshotIds` lists the snapshots a release used. It may equal the previous release's: not every release has a new sync.
- If the design source has moved on and your proof still reads the old one, that is a validity problem, not a note. Report it through `run.inputs` or as an integrity failure (below).

## Subjects, links and release changes

- **`subjects[]` is optional.** A subject (a component family or a page, grouped by `subject.id` and `kind`) needs no entry. Add one to give it a `label`, a `description`, a `sourceUrl` and a `changeNote`. `changeNote` is what changed in this release in your own words; the viewer never derives it.
- **Links** (`subject.sourceUrl`, `snapshot.sourceUrl`) must be `http` or `https`. A script or `file:` URL is rejected. The viewer shows them as links and never follows them. Never put a Figma or Penpot name in the label of the generic chrome; the link text comes from your data.
- **Release changes are computed by `diffProjections(previous, current)`**, not by the provider. For it to say something true, keep **requirement ids stable** across releases and give every reference a **hash** (`writeBundle` fills it in). A requirement is "updated" when its reference hash changed; renaming a requirement id reads as one removed and one added.
- The baseline is the previous release: set `release.previousRelease` to the latest released version before this build.

## Runs, inputs and validity

A run records what produced the evidence and what it was produced from.

- `run.inputs[]` is the engine's `report.inputs[]` shape: `{ role, key, hashKind, sha256, bytes, missing }`. For a native Reflection run, copy it as it is. For your own pipeline, hash the files and data the proof depends on (the coverage contract, the design snapshot, the baselines) with the same shape.
- Keys are relative to a project directory. Never an absolute path.
- Validity is never stored. A viewer with access to the current inputs recomputes it with `computeValidity(recorded, current)` and gets `current`, `stale` (with the exact inputs that changed), `invalid`, `never-run` or `offline`. A bundle opened without live inputs reads `offline`: "freshness not verified".
- `nativeValidity` keeps what your tool said about its own validity. It is shown as "native" and never trusted.
- `verdictHash` and `measuredHash` come from the engine's `report.resultHash`. Without them, an identical rebuild cannot be told apart from a changed one by the run alone, but the decision binding still works from the comparisons.

## Decisions

Providers do not write decisions. The portal records them, bound to content (verdicts, baseline hashes, capture policies, the required set), and evaluates them with `evaluateDecision`:

- `holds`: nothing it was bound to changed.
- `carried-forward`: nothing changed on a rebuilt bundle. Shown as "carried forward from build X" with a one-click re-confirm.
- `lapsed`: something changed; the causes name each changed check, reference, policy or requirement.

What this asks of a provider: **keep verdicts, baseline hashes and requirement ids stable between identical builds.** A provider that puts a timestamp into a verdict or renames ids on every build lapses every decision for no reason.

The only decisions a provider may include are legacy imports of `accept-reference` records, with `attestation: 'agent'`.

## Artifacts

- Paths are relative, use `/`, and contain no `..`. File types are images (`png`, `webp`, `jpg`, `jpeg`, `gif`) and text (`json`, `md`, `txt`). SVG and HTML are refused because they can carry script.
- A path segment named `_raw` is refused: raw design dumps are never published.
- Roles are `reference`, `actual`, `diff` and `debug`. Give each comparison the reference, the actual and the diff the verdict was based on.
- A hash you leave out is filled in from the file by `writeBundle`. A hash you do record must match, or the write fails.
- A dimension mismatch between reference and actual is a finding. Record both sizes (`width`, `height`) and do not scale one image to hide it.

## Writing the bundle

```ts
import { writeBundle } from 'reflection-projection/node';

await writeBundle({
  directory: 'out/release/2.4.0',          // must not exist yet
  projection,                               // validated by projectionSchema
  release: { release: '2.4.0', build: 1, bundleId: 'marwes-2.4.0-build-1', state: 'candidate', builtAt, previousRelease: '2.3.0', snapshotIds },
  generator: { name: 'marwes-reflection-provider', version: '1.0.0' },
  files: [
    { path: 'artifacts/button/primary-hover.png', kind: 'artifact', fromFile: '/work/evidence/primary-hover.png' },
    { path: 'source/snapshot.json', kind: 'source', content: archivedInventoryJson }
  ]
});
```

`writeBundle` refuses to overwrite, writes into a temporary directory and renames it into place, so a failure leaves nothing behind. It rejects a hostile or disallowed path, an artifact nobody supplied, a hash that disagrees with its file, and text that contains an absolute local path, a `file://` URL or an obvious credential (a JWT, a Figma token, an AWS key id, a bearer token). That last check is a safety net: a provider must still keep such values out of what it emits.

The bundle hash covers every file's path and hash, so it changes whenever any content does.

Read a bundle back, as the viewer will, with `openBundle(source, { verifyFiles: 'all' })` and `createDirectorySource(directory)`. A bundle that cannot be trusted as a whole comes back `rejected`; one with a missing or tampered file comes back `opened` with `problems`, and those files must not be shown.

## Validating without this package

`schema/projection.v1.schema.json` is generated from the Zod schema, so a provider in another language or repository can check structure with any JSON Schema validator. It does not cover the integrity rules (unique ids, resolving references, relative paths, decision rules). Run the Zod schema for those, or run `openBundle` over the bundle you wrote; the check in your own CI should be the second one.

## Do not

- Merge the five signals, or show one score for them.
- Report an unknown bucket as 0.
- Forward a folded status word (`blocked`) as a verdict or a proof result.
- Treat `not-run` or `unsupported` as a pass.
- Record an approval for a person, or mark an agent record as `human`.
- Use a transient node id, a run id or a path as a requirement id.
- Put absolute local paths, credentials, tokens, `_raw` content or executable files in a bundle.
- Name Figma, Penpot, a framework or a Discord channel in anything that ships in Reflection.
- Read the Figma REST API to build a bundle without asking the owner of the Figma budget. Use the MCP.
- Add a proposed design variant to the required set from a viewer or a portal. Adding a requirement is a pull request in the project that owns the inventory.

## Provider checklist

- [ ] `inventory` says `full` or `executed-only` and is true.
- [ ] Every required item is a requirement, whether or not it has a design or a test.
- [ ] `readinessConcepts` match what the project can really say; no bucket reported as 0 that is actually unknown.
- [ ] Each snapshot has its own date; comparisons name the snapshot that backed them.
- [ ] No folded word in any `verdict` or `proof`.
- [ ] `run.inputs[]` covers what the proof depends on, with relative keys.
- [ ] Requirement ids and reference hashes are identical between two builds of unchanged design (so `diffProjections` reports no change).
- [ ] Ids and verdicts are identical between two builds of identical evidence (build twice and compare the decision binding).
- [ ] Reference approvals say who recorded them; no agent record is marked `human`.
- [ ] `writeBundle` succeeds, and `openBundle(..., { verifyFiles: 'all' })` returns `opened` with no problems.
- [ ] Counts in your own output match `summarizeProjection`.

## Provider notes

**Marwes (Figma).** Button is 273 required, 203 proven, 0 failing, 14 needs-design, 56 not-enrolled. The required inventory is a repository file (`coverage-contract.json` per family). `reflection/*` frames are generated by the Marwes plugin and are pipeline output, not design: leave them out of "new in the design system". Copy the manifest and inventory into the bundle at release time (`source/snapshot.json`), because `.figma/marwes` is untracked and each sync overwrites it. Read the design through the Figma MCP.

**Sourcer (Penpot).** Login is a page of 30 requirements. `readinessConcepts` are both `false`, so those buckets are `null`. Its existing `approvals.json` records import as `accept-reference` with `attestation: 'agent'`. Sourcer does not pin a Penpot revision yet, so its source currency is unknown: say so with an integrity or `offline` state rather than implying `current`. Read `07-sourcer-integration.md` in the Eagle's Eye handoff before building this provider.
