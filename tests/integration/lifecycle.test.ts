import { mkdir, mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createArtifactStore } from '../../src/core/artifact-store.js';
import { runBeforeRunHooks } from '../../src/contracts/setup/lifecycle.js';

describe('lifecycle beforeRun hooks', () => {
  it('runs setup commands, writes redacted logs, and attaches configured artifacts', async () => {
    const root = await mkdtemp(join(tmpdir(), 'reflection-lifecycle-'));
    const workDir = join(root, 'work');
    const reportRoot = join(root, 'artifacts');
    await mkdir(workDir, { recursive: true });
    const store = await createArtifactStore({ rootDir: reportRoot, runId: 'lifecycle-pass' });

    const checks = await runBeforeRunHooks({
      cwd: workDir,
      store,
      hooks: [
        {
          id: 'fixture',
          command:
            'node -e "require(\'fs\').writeFileSync(\'annual-report-print.html\', \'<h1>Annual Report</h1>\'); console.log(\'authorization: secret-token\')"',
          timeoutMs: 10_000,
          blocking: true,
          scenario: 'annual-report-full-smoke',
          artifacts: [{ path: 'annual-report-print.html', type: 'html', role: 'evidence' }]
        }
      ]
    });

    expect(checks).toHaveLength(1);
    expect(checks[0]).toMatchObject({
      id: 'setup.fixture',
      suite: 'setup',
      status: 'pass',
      metadata: { scenario: 'annual-report-full-smoke' }
    });
    expect(checks[0]?.artifacts.map((artifact) => [artifact.type, artifact.role])).toEqual([
      ['log', 'debug'],
      ['html', 'evidence']
    ]);
    await expect(readFile(store.resolveRunPath('setup/fixture.log'), 'utf8')).resolves.toContain('authorization: [REDACTED]');
    await expect(readFile(store.resolveRunPath('setup/fixture/artifacts/0-annual-report-print.html'), 'utf8')).resolves.toContain('Annual Report');
  });

  it('turns failed blocking hooks into blocking setup failures', async () => {
    const root = await mkdtemp(join(tmpdir(), 'reflection-lifecycle-fail-'));
    const store = await createArtifactStore({ rootDir: join(root, 'artifacts'), runId: 'lifecycle-fail' });

    const checks = await runBeforeRunHooks({
      cwd: root,
      store,
      hooks: [
        {
          id: 'broken-fixture',
          command: 'node -e "process.exit(7)"',
          timeoutMs: 10_000,
          blocking: true,
          artifacts: []
        }
      ]
    });

    expect(checks[0]).toMatchObject({
      id: 'setup.broken-fixture',
      suite: 'setup',
      status: 'fail',
      severity: 'blocking'
    });
    expect(checks[0]?.details).toContain('Exit code: 7');
  });
});
