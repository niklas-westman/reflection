# Provider guide

For anyone writing the code that turns a project's own evidence into a Reflection projection and publishes it as a bundle. The first providers are a Figma-based design system and a Penpot-based product. Read the [README](../README.md) first for what a projection holds; this guide says what a provider must do with it and what it must never do.

A provider lives in the project it describes, not in Reflection. Reflection never learns about Figma, Penpot, a component framework or Discord.

## What a provider produces

1. A `Projection` (validated by `projectionSchema`) with requirements, comparisons, snapshots and runs.
2. The files it points at: comparison images, plus optionally an archived copy of the design inventory.
3. An immutable bundle that holds both, written with `writeBundle` from `reflection-projection/node`.

A provider can run without the engine's report: it reads its own evidence. A project that uses `reflection-check` directly needs no provider; `projectFromReflectionReport` covers it.

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
- `enrolled: false` means a comparison is not set up yet. A project with no notion of enrolment sets `enrolled: true` on every requirement and `readinessConcepts.notEnrolled: false`. `design.availability` is `missing` (no design exists) or `unmapped` (one may exist but is not linked to this requirement).
- Put dimensions in `subject` (`variant`, `mode`, `adapter`, `viewport`, `state`) and the rest in `subject.dimensions`. The UI groups and filters by these without knowing what they mean.
- `requiredImplementations` (optional) names the implementations (adapters) that must each have a comparison and pass before the item is proven. A project with a fixed set of implementations, such as React, Vue and Svelte, should declare it: otherwise an item compared in only one of them reads as proven. A comparison with no `subject.adapter` never satisfies a named implementation, and a failure still reads as failing even when another implementation is missing. Leave it out when implementations are not a fixed set, and only recorded comparisons count.
- `requiredProofs` lists the layers that must pass before the item counts as proven. A layer that is `not-run` or `unsupported` can never count as a pass.

### Readiness concepts

`provider.readinessConcepts` says which buckets your project has an idea of. If your project has no notion of "needs design" or "not enrolled", set that flag to `false`: the summary then reports `null` (unknown) for it, which the UI renders as unknown. **Never report an unknown bucket as 0.** A zero says "we checked and there are none".

Every number a view shows must come from `summarizeProjection`. Do not add your own counts.

## Comparisons

One comparison is one check of a reference against a rendered result.

- `requirementId` joins it to its requirement by exact identity. Do not join by name or position.
- Set the proof of each layer you actually ran. Leave a layer absent if you have no concept of it, and also when it is not required for this item and did not run: a layer that is present counts in the comparison's outcome, so `not-run` on a layer nobody required makes the comparison read as not run.
- **One comparison per requirement and implementation.** When one of your test cases serves several requirements (a behaviour-only item that reuses a visual case), emit a comparison for each requirement, each with its own `requirementId`. One comparison per case leaves the other requirements without evidence.
- `verdict` is what the engine or tool reported, in its own words: `status`, `severity`, `failureClass`. A decision binds to these three fields, so keep them free of anything that differs between identical runs (timestamps, run ids, paths).
- **Never forward a folded word.** If your tool folds coverage gaps into every case outcome (one provider reported `blocked` for every row because coverage gaps were folded into each case outcome), do not copy that word into `verdict` or `proof`. Map the real per-layer result. Keep the tool's own word in `nativeOutcome`; the viewer shows it as "native" next to the verdict and never counts it.
- `limitations` is where to say what a check could not do.
- Record `capturePolicyHash` when the capture settings affect the result. Evidence under another policy is not comparable.
- `diff.metric` is the number the comparison produced: `name` (your tool's id) and `value`. Add `label` (what a reader calls it, "Match"), `unit` ("%"), `direction` (`higher-is-better` or `lower-is-better`) and `passAt` (the passing line, in the same unit) so the viewer can say "Match 99.75 %, passes at 95 % or more" without your tool's documentation. Without them it shows the name and value as recorded.
- Record `reference.baselineSha256` (the hash of the approved baseline file) when you have it. Otherwise the artifact hash is used.

### Reference approval

`reference.approval.state` is `holds`, `lapsed` or `none`, and any state other than `none` must say who recorded it with `attestation`.

- `human`: a person approved this reference and recorded it themselves.
- `delegated`: a person approved it in conversation and an agent wrote it down. `by` is the person, `recordedBy` is the agent, and `note` keeps the person's words (required). It counts as the person's approval, and the viewer says it was recorded by the agent.
- `agent`: an agent or script recorded it with no person's words behind it. **It is shown as not confirmed by a person.** Use it to import a legacy record you cannot trace to a person's words.

The other fields, all optional and all shown in the viewer:

- `by`: who approved. `at`: when.
- `boundTo`: the hash of the design source content the approval named. Use the same value as the snapshot's `sha256` when the snapshot hashes that content (for example your own reference manifest). Never the bundle manifest: it does not exist until after the projection is written.
- `causes`: for `lapsed`, what changed since the approval.
- `note`: free text, shown as written.

A provider never invents an approval and never upgrades an `agent` record to `human` or `delegated`. A record whose source names the person and keeps their words (for example "approved by the owner; recorded by the assistant on that basis") is `delegated`.

## Snapshots and dates

A snapshot is the design data something was proven against. Reflection does not interpret `kind` or `role`; you supply them, and the UI shows your labels.

- Emit **one snapshot per thing that has its own date**. A design system can have a full sync, a per-family capture that a proof actually read, and a coverage contract. Keep them separate; never merge their dates.
- A comparison names the snapshot that actually backed it (`snapshotId`), not the newest one you have. The UI says "proof based on" that date and shows the global sync as context.
- `sha256` is the hash of the design source content the snapshot holds (for example your reference manifest), never of the bundle. A reference approval's `boundTo` uses the same value.
- `fileKey` is the upstream file the snapshot came from. `originalFileKey` is the file it was copied from, if each snapshot is a copy of an original file.
- `release.snapshotIds` lists the snapshots a release used. It may equal the previous release's: not every release has a new sync.
- If the design source has moved on and your proof still reads the old one, that is a validity problem, not a note. Keep the old snapshot and set its `supersededBy` to the id of the snapshot that replaced it. Every comparison that read the superseded snapshot then counts as not proven (never passed or failed), and the viewer says it proved an old design. Do not fake this with an integrity failure.

## Subjects, links and release changes

- **`subjects[]` is optional.** A subject (a component family or a page, grouped by `subject.id` and `kind`) needs no entry. Add one to give it a `label`, a `description`, a `sourceUrl`, a `changeNote` and a `presentation`. `changeNote` is what changed in this release in your own words; the viewer never derives it.
- **`presentation`** says how to lay out the subject's required items. Give every item a value for the `columns` dimension (use a word such as `default` where there is no variant); an item without one is shown under "No value". Each value names a dimension: a common key (`variant`, `mode`, `adapter`, `viewport`, `state`) or a key of `subject.dimensions`. `groupBy` gives one row per value (for example `state`), `columns` puts that dimension's values side by side in the row (`device`: desktop next to mobile), `sections` splits the rows under headings (`surface`: app and email). Failing and unproven items still come first. Without a hint the viewer keeps its default layout; it never guesses from dimension names.
- **Links** (`subject.sourceUrl`, `snapshot.sourceUrl`) must be `http` or `https`. A script or `file:` URL is rejected. The viewer shows them as links and never follows them. Never put a Figma or Penpot name in the label of the generic chrome; the link text comes from your data.
- **Release changes are computed by `diffProjections(previous, current)`**, not by the provider. For it to say something true, keep **requirement ids stable** across releases and give every reference a **hash** (`writeBundle` fills it in). A requirement is "updated" when its reference hash changed; renaming a requirement id reads as one removed and one added.
- The baseline is the previous release: set `release.previousRelease` to the latest released version before this build.

## Runs, inputs and validity

A run records what produced the evidence and what it was produced from.

- `run.inputs[]` is the engine's `report.inputs[]` shape: `{ role, key, hashKind, sha256, bytes, missing }`. For a native Reflection run, copy it as it is. For your own pipeline, hash the files and data the proof depends on (the coverage contract, the design snapshot, the baselines) with the same shape.
- Keys are relative to the project root. Never an absolute path. The engine writes keys relative to its config file; if that file is not at the root, rebase the keys onto the root when you copy them, so a live check can hash the same files.
- `hashKind` is `bytes` (the file's bytes), `canonical-json` (a JSON value in canonical form) or `composite`: one hash you compute over a declared set of files, such as your app code. Name the set in the key (`app:src,public,index.html`) and keep the way you hash it fixed; a changed composite hash reads as that input changed. Prefer one input per file when the list is short, so the stale causes can name the file. For a live check, compute the current value with the same function over the live files.
- Validity is never stored. A viewer with access to the current inputs recomputes it with `computeValidity(recorded, current)` and gets `current`, `stale` (with the exact inputs that changed), `invalid`, `never-run` or `offline`. A bundle opened without live inputs reads `offline`: "freshness not verified".
- `nativeValidity` keeps what your tool said about its own validity. The viewer shows it as "native" beside the run and never trusts it.
- `verdictHash` and `measuredHash` come from the engine's `report.resultHash`. Without them, an identical rebuild cannot be told apart from a changed one by the run alone, but the decision binding still works from the comparisons.

## Decisions

Providers do not write decisions. The portal records them, bound to content (verdicts, baseline hashes, capture policies, the required set), and evaluates them with `evaluateDecision`:

- `holds`: nothing it was bound to changed.
- `carried-forward`: nothing changed on a rebuilt bundle. Shown as "carried forward from build X" with a one-click re-confirm.
- `lapsed`: something changed; the causes name each changed check, reference, policy or requirement.

What this asks of a provider: **keep verdicts, baseline hashes and requirement ids stable between identical builds.** A provider that puts a timestamp into a verdict or renames ids on every build lapses every decision for no reason.

### Accepted deviations

When the owner accepted a difference (a raised pixel limit for label-only text, a known rendering difference), import it as a decision with `kind: 'accept-deviation'`, `scope.comparisonIds` naming the comparisons it covers, and `binding: bindingForComparisons(projection, comparisonIds)`. Use `delegated` (with `recordedBy` and the owner's words in `comment`) or `human`, never `agent`. The comparisons keep their own outcome: a deviation is review, not proof. The viewer counts the items that pass within an accepted deviation, shows the decision on each comparison, and says when it lapsed because a verdict, a reference or a capture policy changed. Keep the raised limit itself in `diff.threshold` and `diff.metric.passAt`.

`buildDecisionBinding(requirements, comparisons)` takes the two lists, not a projection. **Build a binding from the hashes the bundle will carry.** A binding records each comparison's reference hash (`reference.baselineSha256`, else the reference artifact's `sha256`). If you leave artifact hashes for `writeBundle` to fill in and build the binding before writing, the binding has no reference hashes and the decision reads as lapsed in the viewer. Set `baselineSha256` (or hash the reference files yourself) before you build it.

The other decisions a provider may include are imports of `accept-reference` records: `delegated` when the record names the person and keeps their words (`recordedBy`, and the words in `comment`), `agent` otherwise. A person's decision given to an agent in conversation is recorded as `delegated`; the portal records its own as `human`.

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
  release: { release: '2.4.0', build: 1, bundleId: 'my-project-2.4.0-build-1', state: 'candidate', builtAt, previousRelease: '2.3.0', snapshotIds },
  generator: { name: 'my-reflection-provider', version: '1.0.0' },
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
- Record an approval for a person without their words, or mark an agent record as `human` or `delegated`.
- Use a transient node id, a run id or a path as a requirement id.
- Put absolute local paths, credentials, tokens, `_raw` content or executable files in a bundle.
- Name Figma, Penpot, a framework or a Discord channel in anything that ships in Reflection.
- Add a proposed design variant to the required set from a viewer or a portal. Adding a requirement is a pull request in the project that owns the inventory.

## Provider checklist

- [ ] `inventory` says `full` or `executed-only` and is true.
- [ ] Every required item is a requirement, whether or not it has a design or a test.
- [ ] If the project has a fixed set of implementations, every requirement names them in `requiredImplementations`.
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

Facts specific to one design tool or one project (how its inventory is kept, which dates it has, what its evidence folder holds) belong with that provider, not in this guide. The rules above are the contract; a provider documents how it meets them.
