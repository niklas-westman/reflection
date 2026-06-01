import { mkdir, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createCli } from '../../src/cli.js';
import { collectGarbage, type GcPlan } from '../../src/core/gc.js';

async function makeTempDir(name: string): Promise<string> {
  const dir = join(tmpdir(), `${name}-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  await mkdir(dir, { recursive: true });
  return dir;
}

async function writeRun(root: string, runId: string, options: { pinned?: boolean; validManifest?: boolean } = {}): Promise<void> {
  const runDir = join(root, 'runs', runId);
  await mkdir(runDir, { recursive: true });
  await writeFile(join(runDir, 'report.json'), '{}\n', 'utf8');

  if (options.validManifest === false) {
    await writeFile(join(runDir, 'manifest.json'), '{ not json }\n', 'utf8');
    return;
  }

  await writeFile(
    join(runDir, 'manifest.json'),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        runId,
        createdAt: '2026-06-01T12:00:00.000Z',
        project: 'gc-fixture',
        status: 'pass',
        mode: 'smoke',
        ci: false,
        retention: { pinned: options.pinned === true },
        files: [{ path: 'report.json', type: 'report' }]
      },
      null,
      2
    )}\n`,
    'utf8'
  );
}

function eligibleRunIds(plan: GcPlan): string[] {
  return plan.eligible.map((run) => run.runId).sort();
}

function skippedRunIds(plan: GcPlan): string[] {
  return plan.skipped.map((run) => run.runId).sort();
}

describe('collectGarbage', () => {
  it('dry-runs only unpinned run directories with valid manifests', async () => {
    const root = await makeTempDir('reflection-gc');
    await writeRun(root, 'old-run');
    await writeRun(root, 'pinned-run', { pinned: true });
    await writeRun(root, 'invalid-run', { validManifest: false });
    await mkdir(join(root, 'runs', 'no-manifest'), { recursive: true });
    await mkdir(join(root, 'baselines', 'login'), { recursive: true });
    await writeFile(join(root, 'runs', 'latest'), 'old-run\n', 'utf8');

    const plan = await collectGarbage({ reportDir: root, dryRun: true });

    expect(eligibleRunIds(plan)).toEqual(['old-run']);
    expect(skippedRunIds(plan)).toEqual(['invalid-run', 'no-manifest', 'pinned-run']);
    expect(plan.deleted).toEqual([]);
    await expect(stat(join(root, 'runs', 'old-run'))).resolves.toBeDefined();
    await expect(stat(join(root, 'baselines', 'login'))).resolves.toBeDefined();
  });

  it('deletes only eligible run directories and never deletes baselines', async () => {
    const root = await makeTempDir('reflection-gc');
    await writeRun(root, 'delete-me');
    await writeRun(root, 'keep-me', { pinned: true });
    await mkdir(join(root, 'baselines', 'login'), { recursive: true });
    await writeFile(join(root, 'baselines', 'login', 'mobile.png'), 'BASELINE', 'utf8');

    const plan = await collectGarbage({ reportDir: root, dryRun: false });

    expect(plan.deleted.map((run) => run.runId)).toEqual(['delete-me']);
    await expect(stat(join(root, 'runs', 'delete-me'))).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(stat(join(root, 'runs', 'keep-me'))).resolves.toBeDefined();
    await expect(readFile(join(root, 'baselines', 'login', 'mobile.png'), 'utf8')).resolves.toBe('BASELINE');
  });

  it('refuses a symlinked runs directory so GC cannot delete baselines through it', async () => {
    const root = await makeTempDir('reflection-gc');
    await mkdir(join(root, 'baselines', 'baseline-run'), { recursive: true });
    await writeFile(
      join(root, 'baselines', 'baseline-run', 'manifest.json'),
      `${JSON.stringify({
        schemaVersion: 1,
        runId: 'baseline-run',
        createdAt: '2026-06-01T12:00:00.000Z',
        project: 'gc-fixture',
        status: 'pass',
        mode: 'smoke',
        ci: false,
        retention: { pinned: false },
        files: [{ path: 'report.json', type: 'report' }]
      })}\n`,
      'utf8'
    );
    await symlink(join(root, 'baselines'), join(root, 'runs'), 'dir');

    await expect(collectGarbage({ reportDir: root, dryRun: false })).rejects.toThrow(/runs directory/i);
    await expect(stat(join(root, 'baselines', 'baseline-run'))).resolves.toBeDefined();
  });

  it('refuses to delete symlinked run directories that resolve outside the artifact root', async () => {
    const root = await makeTempDir('reflection-gc');
    const outside = await makeTempDir('reflection-gc-outside');
    await mkdir(join(root, 'runs'), { recursive: true });
    await writeRun(outside, 'linked-run');
    await symlink(join(outside, 'runs', 'linked-run'), join(root, 'runs', 'linked-run'), 'dir');

    const plan = await collectGarbage({ reportDir: root, dryRun: false });

    expect(plan.eligible).toEqual([]);
    expect(plan.skipped).toEqual([
      expect.objectContaining({ runId: 'linked-run', reason: expect.stringContaining('outside') })
    ]);
    await expect(stat(join(outside, 'runs', 'linked-run'))).resolves.toBeDefined();
  });
});

describe('reflection gc CLI', () => {
  it('prints a dry-run cleanup plan', async () => {
    const root = await makeTempDir('reflection-gc-cli');
    await writeRun(root, 'cli-run');
    let stdout = '';
    const originalLog = console.log;
    vi.spyOn(console, 'log').mockImplementation((...values: unknown[]) => {
      stdout += `${values.join(' ')}\n`;
    });

    try {
      await createCli().exitOverride().parseAsync(['node', 'reflection', 'gc', '--report-dir', root, '--dry-run'], { from: 'node' });
    } finally {
      console.log = originalLog;
    }

    expect(stdout).toContain('Reflection GC');
    expect(stdout).toContain('Dry run: yes');
    expect(stdout).toContain('cli-run');
  });
});
