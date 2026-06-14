import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CommanderError } from 'commander';
import { describe, expect, it, vi } from 'vitest';
import { runCommand } from '../../src/commands/run.js';
import { runDesignContract } from '../../src/contracts/design/design-contract.js';
import { createArtifactStore } from '../../src/core/artifact-store.js';
import { ExitCode } from '../../src/core/exit-codes.js';
import type { ReflectionReport } from '../../src/core/report-schema.js';

async function makeTempDir(name: string): Promise<string> {
  const dir = join(tmpdir(), `${name}-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  await mkdir(dir, { recursive: true });
  return dir;
}

async function writeNodeScript(root: string, filename: string, source: string): Promise<string> {
  const scriptPath = join(root, filename);
  await writeFile(scriptPath, source, 'utf8');
  return scriptPath;
}

function nodeCommand(scriptPath: string): string {
  return `${JSON.stringify(process.execPath)} ${JSON.stringify(scriptPath)}`;
}

async function captureRunCommand(options: Parameters<typeof runCommand>[0]): Promise<{ stdout: string; stderr: string; exitCode?: number }> {
  let stdout = '';
  let stderr = '';
  let exitCode: number | undefined;
  const originalLog = console.log;
  const originalError = console.error;
  vi.spyOn(console, 'log').mockImplementation((...values: unknown[]) => {
    stdout += `${values.join(' ')}\n`;
  });
  vi.spyOn(console, 'error').mockImplementation((...values: unknown[]) => {
    stderr += `${values.join(' ')}\n`;
  });

  try {
    await runCommand(options);
  } catch (error) {
    if (error instanceof CommanderError) {
      exitCode = error.exitCode;
    } else {
      throw error;
    }
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }

  return { stdout, stderr, exitCode };
}

describe('design command adapter', () => {
  it('normalizes a passing design/source validator command into a design check with full log artifact', async () => {
    const root = await makeTempDir('reflection-design-pass');
    const scriptPath = await writeNodeScript(
      root,
      'validator.mjs',
      `console.log('tokens ok');\nconsole.error('source check warning detail');\n`
    );
    const store = await createArtifactStore({ rootDir: join(root, 'artifacts'), runId: 'design-pass' });

    const checks = await runDesignContract(
      {
        commands: [{ id: 'tokens', command: nodeCommand(scriptPath) }]
      },
      store
    );

    expect(checks).toHaveLength(1);
    expect(checks[0]?.id).toBe('design.tokens');
    expect(checks[0]?.suite).toBe('design');
    expect(checks[0]?.status).toBe('pass');
    expect(checks[0]?.severity).toBe('blocking');
    expect(checks[0]?.summary).toContain('token/source contract');
    expect(checks[0]?.summary.toLowerCase()).not.toContain('visual parity');
    expect(checks[0]?.metadata.exitCode).toBe(0);
    const log = checks[0]?.artifacts.find((artifact) => artifact.type === 'log');
    expect(log?.role).toBe('debug');
    expect(log?.path).toBe('design/tokens.log');
    await expect(readFile(store.resolveRunPath(log?.path ?? ''), 'utf8')).resolves.toContain('tokens ok');
    await expect(readFile(store.resolveRunPath(log?.path ?? ''), 'utf8')).resolves.toContain('source check warning detail');
  });

  it('preserves Reflection-compatible structured JSON checks with family and target metadata', async () => {
    const root = await makeTempDir('reflection-design-structured');
    const scriptPath = await writeNodeScript(
      root,
      'validator.mjs',
      `console.log(JSON.stringify({
        reflection: 'design-checks-v1',
        checks: [
          {
            id: 'button.primary.tokens',
            family: 'button',
            target: 'primary-button',
            status: 'pass',
            severity: 'blocking',
            summary: 'Primary button tokens match source contract.',
            details: 'Compared token family button.primary.',
            metadata: { tokenPath: 'button.primary' }
          },
          {
            id: 'card.spacing',
            family: 'card',
            target: 'marketing-card',
            status: 'warn',
            severity: 'review',
            summary: 'Card spacing needs review.'
          }
        ]
      }));\n`
    );
    const store = await createArtifactStore({ rootDir: join(root, 'artifacts'), runId: 'design-structured' });

    const checks = await runDesignContract(
      {
        commands: [{ id: 'tokens', command: nodeCommand(scriptPath) }]
      },
      store
    );

    expect(checks.map((check) => check.id)).toEqual(['design.button.primary.tokens', 'design.card.spacing']);
    expect(checks[0]).toMatchObject({
      suite: 'design',
      target: 'primary-button',
      status: 'pass',
      severity: 'blocking',
      summary: 'Primary button tokens match source contract.',
      details: 'Compared token family button.primary.',
      metadata: {
        family: 'button',
        commandId: 'tokens',
        tokenPath: 'button.primary',
        classification: 'token-source-contract'
      }
    });
    expect(checks[1]).toMatchObject({
      suite: 'design',
      target: 'marketing-card',
      status: 'warn',
      severity: 'review',
      metadata: {
        family: 'card',
        commandId: 'tokens',
        classification: 'token-source-contract'
      }
    });
    expect(checks[0]?.artifacts[0]?.path).toBe('design/tokens.log');
    expect(checks[1]?.artifacts[0]?.path).toBe('design/tokens.log');
  });

  it('uses non-blocking command severity defaults for structured findings without explicit severity', async () => {
    const root = await makeTempDir('reflection-design-structured-review');
    const scriptPath = await writeNodeScript(
      root,
      'validator.mjs',
      `console.log(JSON.stringify({
        reflection: 'design-checks-v1',
        checks: [
          {
            id: 'button.primary.tokens',
            family: 'button',
            target: 'primary-button',
            status: 'fail',
            summary: 'Primary button tokens drifted.'
          }
        ]
      }));\n`
    );
    const store = await createArtifactStore({ rootDir: join(root, 'artifacts'), runId: 'design-structured-review' });

    const checks = await runDesignContract(
      {
        commands: [{ id: 'tokens', command: nodeCommand(scriptPath), blocking: false }]
      },
      store
    );

    expect(checks).toHaveLength(1);
    expect(checks[0]).toMatchObject({
      id: 'design.button.primary.tokens',
      status: 'fail',
      severity: 'review',
      target: 'primary-button',
      metadata: {
        family: 'button',
        commandId: 'tokens'
      }
    });
  });

  it('adds a command failure check when structured JSON is emitted but the command exits non-zero', async () => {
    const root = await makeTempDir('reflection-design-structured-command-fail');
    const scriptPath = await writeNodeScript(
      root,
      'validator.mjs',
      `console.log(JSON.stringify({
        reflection: 'design-checks-v1',
        checks: [
          {
            id: 'button.primary.tokens',
            family: 'button',
            target: 'primary-button',
            status: 'pass',
            summary: 'Primary button tokens match source contract.'
          }
        ]
      }));\nprocess.exit(9);\n`
    );
    const store = await createArtifactStore({ rootDir: join(root, 'artifacts'), runId: 'design-structured-command-fail' });

    const checks = await runDesignContract(
      {
        commands: [{ id: 'tokens', command: nodeCommand(scriptPath) }]
      },
      store
    );

    expect(checks.map((check) => check.id)).toEqual(['design.button.primary.tokens', 'design.tokens.command']);
    expect(checks[0]).toMatchObject({ status: 'pass', target: 'primary-button' });
    expect(checks[1]).toMatchObject({
      suite: 'design',
      target: 'tokens',
      status: 'fail',
      severity: 'blocking',
      metadata: {
        exitCode: 9,
        structuredOutput: true,
        classification: 'token-source-contract'
      }
    });
  });

  it('turns a non-zero command exit into a blocking failure by default', async () => {
    const root = await makeTempDir('reflection-design-fail');
    const scriptPath = await writeNodeScript(root, 'validator.mjs', `console.error('missing token: color.brand');\nprocess.exit(7);\n`);
    const store = await createArtifactStore({ rootDir: join(root, 'artifacts'), runId: 'design-fail' });

    const checks = await runDesignContract(
      {
        commands: [{ id: 'tokens', command: nodeCommand(scriptPath) }]
      },
      store
    );

    expect(checks[0]?.status).toBe('fail');
    expect(checks[0]?.severity).toBe('blocking');
    expect(checks[0]?.summary).toContain('token/source contract');
    expect(checks[0]?.metadata.exitCode).toBe(7);
    await expect(readFile(store.resolveRunPath('design/tokens.log'), 'utf8')).resolves.toContain('missing token: color.brand');
  });

  it('can make a non-zero command review-only when blocking is disabled', async () => {
    const root = await makeTempDir('reflection-design-review');
    const scriptPath = await writeNodeScript(root, 'validator.mjs', `console.log('soft lint finding');\nprocess.exit(3);\n`);
    const store = await createArtifactStore({ rootDir: join(root, 'artifacts'), runId: 'design-review' });

    const checks = await runDesignContract(
      {
        commands: [{ id: 'copy', command: nodeCommand(scriptPath), blocking: false }]
      },
      store
    );

    expect(checks[0]?.status).toBe('warn');
    expect(checks[0]?.severity).toBe('review');
    expect(checks[0]?.summary).toContain('token/source contract');
  });

  it('wires reflection run --mode design through configured commands and writes the report artifacts', async () => {
    const root = await makeTempDir('reflection-design-run');
    const scriptPath = await writeNodeScript(root, 'validator.mjs', `console.log('design source contract ok');\n`);
    const configPath = join(root, 'reflection.config.mjs');
    const reportRoot = join(root, 'artifacts');
    await writeFile(
      configPath,
      `export default {
        project: 'design-run-fixture',
        contracts: {
          design: {
            commands: [{ id: 'tokens', command: ${JSON.stringify(nodeCommand(scriptPath))} }]
          }
        }
      };\n`,
      'utf8'
    );

    const result = await captureRunCommand({ config: configPath, reportDir: reportRoot, mode: 'design' });
    const latest = (await readFile(join(reportRoot, 'runs/latest'), 'utf8')).trim();
    const report = JSON.parse(await readFile(join(reportRoot, 'runs', latest, 'report.json'), 'utf8')) as ReflectionReport;
    const markdown = await readFile(join(reportRoot, 'runs', latest, 'report.md'), 'utf8');

    expect(result.exitCode).toBeUndefined();
    expect(result.stdout).toContain('design.tokens');
    expect(report.status).toBe('pass');
    expect(report.checks.map((check) => check.id)).toEqual(['design.tokens']);
    expect(markdown).toContain('Full machine report: [report.json](report.json)');
    expect(markdown).not.toContain('token/source contract');
    expect(markdown.toLowerCase()).not.toContain('visual parity');
    await expect(readFile(join(reportRoot, 'runs', latest, 'design/tokens.log'), 'utf8')).resolves.toContain('design source contract ok');
  });

  it('keeps reflection run successful for a non-blocking design command that needs review', async () => {
    const root = await makeTempDir('reflection-design-run-review');
    const scriptPath = await writeNodeScript(root, 'validator.mjs', `console.error('source token contract warning');\nprocess.exit(4);\n`);
    const configPath = join(root, 'reflection.config.mjs');
    const reportRoot = join(root, 'artifacts');
    await writeFile(
      configPath,
      `export default {
        project: 'design-run-review-fixture',
        contracts: {
          design: {
            commands: [{ id: 'tokens', command: ${JSON.stringify(nodeCommand(scriptPath))}, blocking: false }]
          }
        }
      };\n`,
      'utf8'
    );

    const result = await captureRunCommand({ config: configPath, reportDir: reportRoot, mode: 'design' });

    expect(result.exitCode).toBeUndefined();
    expect(result.stdout).toContain('⚠ design.tokens');
    const latest = (await readFile(join(reportRoot, 'runs/latest'), 'utf8')).trim();
    const report = JSON.parse(await readFile(join(reportRoot, 'runs', latest, 'report.json'), 'utf8')) as ReflectionReport;
    expect(report.status).toBe('pass-with-review');
    expect(report.checks[0]?.severity).toBe('review');
  });

  it('returns a blocking failure exit code when reflection run --mode design sees a failing blocking command', async () => {
    const root = await makeTempDir('reflection-design-run-fail');
    const scriptPath = await writeNodeScript(root, 'validator.mjs', `console.error('source token contract failed');\nprocess.exit(5);\n`);
    const configPath = join(root, 'reflection.config.mjs');
    const reportRoot = join(root, 'artifacts');
    await writeFile(
      configPath,
      `export default {
        project: 'design-run-fixture',
        contracts: {
          design: {
            commands: [{ id: 'tokens', command: ${JSON.stringify(nodeCommand(scriptPath))} }]
          }
        }
      };\n`,
      'utf8'
    );

    const result = await captureRunCommand({ config: configPath, reportDir: reportRoot, mode: 'design' });

    expect(result.exitCode).toBe(ExitCode.BlockingFailure);
    expect(result.stdout).toContain('✕ design.tokens');
    const latest = (await readFile(join(reportRoot, 'runs/latest'), 'utf8')).trim();
    const report = JSON.parse(await readFile(join(reportRoot, 'runs', latest, 'report.json'), 'utf8')) as ReflectionReport;
    expect(report.status).toBe('fail');
  });
});
