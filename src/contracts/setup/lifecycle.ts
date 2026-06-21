import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import type { ArtifactStore } from '../../core/artifact-store.js';
import { redactSensitiveText } from '../../core/redaction.js';
import type { ArtifactRef, CheckResult } from '../../core/report-schema.js';

export type LifecycleArtifactConfig = {
  path: string;
  type: ArtifactRef['type'];
  role?: ArtifactRef['role'] | undefined;
};

export type LifecycleHook = {
  id: string;
  command: string;
  cwd?: string | undefined;
  timeoutMs: number;
  blocking: boolean;
  scenario?: string | undefined;
  artifacts: LifecycleArtifactConfig[];
};

export async function runBeforeRunHooks(input: {
  hooks: LifecycleHook[];
  store: ArtifactStore;
  cwd: string;
}): Promise<CheckResult[]> {
  const checks: CheckResult[] = [];

  for (const hook of input.hooks) {
    checks.push(await runBeforeRunHook({ hook, store: input.store, cwd: input.cwd }));
  }

  return checks;
}

async function runBeforeRunHook(input: {
  hook: LifecycleHook;
  store: ArtifactStore;
  cwd: string;
}): Promise<CheckResult> {
  const hookCwd = resolve(input.cwd, input.hook.cwd ?? '.');
  const result = await runShellCommand(input.hook.command, hookCwd, input.hook.timeoutMs);
  const artifacts: ArtifactRef[] = [
    await input.store.writeText(
      `setup/${input.hook.id}.log`,
      renderHookLog({ command: input.hook.command, cwd: hookCwd, result })
    )
  ];
  const artifactFailures: string[] = [];

  for (const [index, artifact] of input.hook.artifacts.entries()) {
    try {
      const sourcePath = resolve(hookCwd, artifact.path);
      const content = await readFile(sourcePath);
      artifacts.push(
        await input.store.writeBuffer(
          `setup/${input.hook.id}/artifacts/${index}-${basename(artifact.path)}`,
          content
        ).then((ref) => ({
          ...ref,
          type: artifact.type,
          ...(artifact.role ? { role: artifact.role } : {})
        }))
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      artifactFailures.push(`${artifact.path}: ${message}`);
    }
  }

  const failed = result.exitCode !== 0 || result.timedOut || artifactFailures.length > 0;
  const blocking = input.hook.blocking;

  return {
    id: `setup.${input.hook.id}`,
    suite: 'setup',
    target: input.hook.command,
    status: failed ? (blocking ? 'fail' : 'warn') : 'pass',
    severity: failed ? (blocking ? 'blocking' : 'review') : 'info',
    summary: failed
      ? `${input.hook.id} setup hook failed.`
      : `${input.hook.id} setup hook completed.`,
    ...(failed
      ? {
          details: [
            result.timedOut ? `Timed out after ${input.hook.timeoutMs}ms.` : undefined,
            result.exitCode !== 0 ? `Exit code: ${result.exitCode}.` : undefined,
            ...artifactFailures
          ]
            .filter(Boolean)
            .join('\n')
        }
      : {}),
    artifacts,
    metadata: {
      hookId: input.hook.id,
      cwd: hookCwd,
      exitCode: result.exitCode,
      timedOut: result.timedOut,
      ...(input.hook.scenario ? { scenario: input.hook.scenario } : {})
    },
    ...(failed ? { suggestedNextStep: 'Fix the setup hook before relying on downstream rendered evidence.' } : {})
  };
}

type ShellResult = {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  timedOut: boolean;
  stdout: string;
  stderr: string;
};

async function runShellCommand(command: string, cwd: string, timeoutMs: number): Promise<ShellResult> {
  return new Promise((resolveResult) => {
    const child = spawn(command, { cwd, shell: true, stdio: 'pipe' });
    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null) {
          child.kill('SIGKILL');
        }
      }, 1_000).unref();
    }, timeoutMs);

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on('close', (exitCode, signal) => {
      clearTimeout(timeout);
      resolveResult({
        exitCode,
        signal: signal as NodeJS.Signals | null,
        timedOut,
        stdout: redactSensitiveText(stdout),
        stderr: redactSensitiveText(stderr)
      });
    });
  });
}

function renderHookLog(input: { command: string; cwd: string; result: ShellResult }): string {
  return [
    '# Reflection setup hook log',
    '',
    `Command: ${input.command}`,
    `CWD: ${input.cwd}`,
    `Exit code: ${input.result.exitCode ?? 'null'}`,
    `Signal: ${input.result.signal ?? 'none'}`,
    `Timed out: ${input.result.timedOut ? 'yes' : 'no'}`,
    '',
    '## stdout',
    '',
    input.result.stdout || '(empty)',
    '',
    '## stderr',
    '',
    input.result.stderr || '(empty)',
    ''
  ].join('\n');
}
