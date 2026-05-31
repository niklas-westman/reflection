import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { createArtifactStore } from '../../src/core/artifact-store.js';
import { createRunManifest } from '../../src/core/manifest.js';
import { writeReports } from '../../src/core/report-writer.js';
import { type CheckResult, type ReflectionReport } from '../../src/core/report-schema.js';

async function tempRoot() {
  const dir = join(tmpdir(), `reflection-artifacts-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  await mkdir(dir, { recursive: true });
  return dir;
}

function check(overrides: Partial<CheckResult> = {}): CheckResult {
  return {
    id: 'browser.login.mobile',
    suite: 'browser',
    target: '/login mobile',
    status: 'pass',
    severity: 'blocking',
    summary: 'Login mobile passed.',
    artifacts: [],
    metadata: {},
    ...overrides
  };
}

describe('artifact store', () => {
  it('creates a run directory under .reflection/runs and updates latest pointer', async () => {
    const root = await tempRoot();
    const store = await createArtifactStore({ rootDir: join(root, '.reflection'), runId: 'run-001' });

    await store.ensureRunDir();
    await store.writeText('browser/login/mobile/metadata.json', '{"ok":true}');
    await store.updateLatestPointer();

    await expect(stat(join(root, '.reflection/runs/run-001'))).resolves.toBeTruthy();
    await expect(readFile(join(root, '.reflection/runs/run-001/browser/login/mobile/metadata.json'), 'utf8')).resolves.toBe(
      '{"ok":true}'
    );
    await expect(readFile(join(root, '.reflection/runs/latest'), 'utf8')).resolves.toBe('run-001\n');

    await rm(root, { recursive: true, force: true });
  });

  it('rejects path traversal writes outside the run directory', async () => {
    const root = await tempRoot();
    const store = await createArtifactStore({ rootDir: join(root, '.reflection'), runId: 'run-001' });

    await expect(store.writeText('../escape.txt', 'bad')).rejects.toThrow(/Refusing to write artifact outside run directory/);

    await rm(root, { recursive: true, force: true });
  });
});

describe('manifest and report writer', () => {
  it('writes manifest, report.json, and readable report.md', async () => {
    const root = await tempRoot();
    const store = await createArtifactStore({ rootDir: join(root, '.reflection'), runId: 'run-002' });
    const checks = [check(), check({ id: 'visual.login.mobile', suite: 'visual', status: 'warn', severity: 'review' })];
    const report: ReflectionReport = {
      schemaVersion: 1,
      runId: 'run-002',
      project: 'reflection-test',
      startedAt: '2026-05-31T18:00:00.000Z',
      finishedAt: '2026-05-31T18:00:01.000Z',
      status: 'pass-with-review',
      mode: 'smoke',
      ci: false,
      environment: { profile: 'local' },
      summary: {
        passed: 1,
        failed: 0,
        warnings: 1,
        skipped: 0,
        blockingFailures: 0,
        reviewItems: 1
      },
      checks,
      artifacts: [],
      suggestedNextSteps: [{ kind: 'review', summary: 'Inspect review items.' }]
    };

    const written = await writeReports(store, report);
    const manifest = createRunManifest({ report, files: written });
    await store.writeJson('manifest.json', manifest);

    const reportJson = JSON.parse(await readFile(join(root, '.reflection/runs/run-002/report.json'), 'utf8')) as ReflectionReport;
    const reportMd = await readFile(join(root, '.reflection/runs/run-002/report.md'), 'utf8');
    const manifestJson = JSON.parse(await readFile(join(root, '.reflection/runs/run-002/manifest.json'), 'utf8')) as unknown;

    expect(reportJson.status).toBe('pass-with-review');
    expect(reportMd).toContain('# Reflection Report');
    expect(reportMd).toContain('Status: pass-with-review');
    expect(reportMd).toContain('## Review items');
    expect(manifestJson).toMatchObject({ schemaVersion: 1, runId: 'run-002', status: 'pass-with-review' });

    await rm(root, { recursive: true, force: true });
  });

  it('records artifact bytes and sha256 for written files', async () => {
    const root = await tempRoot();
    const store = await createArtifactStore({ rootDir: join(root, '.reflection'), runId: 'run-003' });
    await store.ensureRunDir();
    await writeFile(join(root, '.reflection/runs/run-003/debug.log'), 'hello', 'utf8');

    const artifact = await store.describeArtifact('debug.log', 'log', 'debug');

    expect(artifact.bytes).toBe(5);
    expect(artifact.sha256).toHaveLength(64);

    await rm(root, { recursive: true, force: true });
  });
});
