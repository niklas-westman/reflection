# Artifacts and garbage collection

Reflection writes every run as a reviewable artifact bundle. The bundle is designed for humans, agents, and CI systems to inspect after success or failure.

## Default artifact roots

| Context | Default root |
| --- | --- |
| Local run | `.reflection` |
| CI run with `--ci` | `artifacts/reflection` |
| Explicit override | `--report-dir <path>` |

A run is written under:

```text
<report-root>/runs/<run-id>/
```

The latest run pointer is:

```text
<report-root>/runs/latest
```

## Run bundle layout

Typical files:

```text
.reflection/runs/<run-id>/
  report.md
  report.json
  manifest.json
  browser/
    <route-id>/
      <viewport>/
        actual.png
        metadata.json
  visual/
    <case-id>/
      expected.png
      actual.png
      diff.png
  server/
    app.log
    storybook.log
```

Not every run contains every folder. For example, a browser-only run may have screenshots but no component visual artifacts.

## `report.json`

`report.json` is the stable machine-readable summary for agents and CI. It includes:

- `runId`, `project`, mode, CI flag, and environment metadata;
- overall status: `pass`, `pass-with-review`, `fail`, or `error`;
- structured checks with `id`, `suite`, `target`, `status`, `severity`, artifacts, metadata, and suggested next steps;
- top-level artifact references.

Use `reflection review --json` rather than hand-parsing reports when an agent needs a compact summary of latest evidence.

## `report.md`

`report.md` is the human-readable report. Link this in PRs or task summaries when the recipient wants to inspect the run quickly.

## `manifest.json`

`manifest.json` records the report files currently tracked for run retention plus whether the run is pinned.

Garbage collection uses this manifest to decide whether a run directory is eligible for deletion. Runs with missing or malformed manifests are skipped rather than deleted. Runtime evidence such as browser screenshots, visual artifacts, and logs still belongs to the run directory even though the current manifest only enumerates report files.

## Evidence artifacts

Evidence artifacts are run-scoped and safe to regenerate:

- screenshots from browser and component checks;
- visual `expected`, `actual`, and `diff` images copied or generated for the run;
- server logs;
- reports and metadata.

Evidence artifacts are not approved baselines. Approved baselines live outside run directories in the configured baseline root.

## Garbage collection

Use GC to clean old run artifacts without touching baselines:

```bash
reflection gc --dry-run
reflection gc --delete
```

With a custom report root:

```bash
reflection gc --report-dir artifacts/reflection --dry-run
```

Safety behavior:

- GC only operates under `<report-root>/runs`.
- `latest` is never treated as a run directory.
- Symlinked `runs` directories are refused.
- Symlinked run directories are skipped.
- Runs with missing, invalid, mismatched, or pinned manifests are skipped.
- Baseline roots are not part of GC.

Use `--dry-run` first in local development and CI diagnostics. Use `--delete` only when the listed eligible run directories are safe to remove.

## What to commit

Usually commit:

- `reflection.config.ts`;
- baseline images after explicit approval;
- docs or agent pointer sections;
- workflow files that run Reflection.

Usually do not commit:

- `.reflection/runs/**`;
- `artifacts/reflection/runs/**`;
- server logs;
- transient screenshots and visual diffs.

CI should upload run artifacts even when validation fails so humans and agents can inspect evidence.
