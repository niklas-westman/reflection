# Reflection in CI

Reflection is designed to be safe in CI: runs create evidence artifacts, but they do not mutate visual baselines.

## Recommended command

Install Reflection in the consuming repository:

```bash
pnpm add -D reflection-check
```

Then run the CI evidence loop:

```bash
reflection doctor --config reflection.config.ts
reflection run --ci --config reflection.config.ts --mode smoke
reflection review --report-dir artifacts/reflection --json
```

When `--ci` is enabled and `--report-dir` is not provided, Reflection writes artifacts to:

```text
artifacts/reflection
```

The generated report is written under:

```text
artifacts/reflection/runs/<run-id>/report.md
artifacts/reflection/runs/<run-id>/report.json
artifacts/reflection/runs/latest
```

## CI defaults

- `reflection run --ci` records the environment profile as `ci`.
- Workers default to `1` for stable browser and visual evidence.
- Videos and traces remain off by default unless a future explicit policy enables them.
- CI never updates baselines. Baseline promotion must use `reflection update` outside CI with an explicit human review step; `reflection update --ci` is refused.

## Exit codes

| Exit code | Meaning |
| --- | --- |
| `0` | Success, including `pass` and `pass-with-review` reports. Review items can be uploaded as artifacts without failing CI. |
| `1` | Blocking validation failure. A blocking check failed. |
| `2` | Tool/configuration error. Reflection could not complete because setup, config, dependency, or runtime execution failed. |
| `64` | Invalid CLI usage, such as an unsupported run mode or invalid option value. |
| `69` | Missing dependency. Reserved for dependency checks such as browser/runtime availability. |

## GitHub Actions example

See `.github/workflows/reflection.yml` for a repo-owned example that installs dependencies, builds Reflection, runs `reflection run --ci`, reviews `artifacts/reflection`, and uploads the report root for inspection.
