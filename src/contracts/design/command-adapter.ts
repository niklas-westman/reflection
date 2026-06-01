import { spawn } from 'node:child_process';
import type { ArtifactStore } from '../../core/artifact-store.js';
import type { ArtifactRef } from '../../core/report-schema.js';

export type DesignCommandConfig = {
  id: string;
  command: string;
  cwd?: string | undefined;
  blocking?: boolean | undefined;
};

export type DesignCommandResult = {
  command: DesignCommandConfig;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  artifact: ArtifactRef;
};

export async function runDesignCommand(command: DesignCommandConfig, store: ArtifactStore): Promise<DesignCommandResult> {
  const result = await executeShellCommand(command);
  const artifact = await store.writeText(`design/${safeArtifactName(command.id)}.log`, renderCommandLog(command, result));

  return {
    command,
    ...result,
    artifact: { ...artifact, type: 'log', role: 'debug' }
  };
}

type ShellResult = {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
};

function executeShellCommand(command: DesignCommandConfig): Promise<ShellResult> {
  return new Promise((resolve) => {
    const child = spawn(command.command, {
      cwd: command.cwd ?? process.cwd(),
      shell: true,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];

    child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
    child.on('close', (exitCode, signal) => {
      resolve({
        exitCode,
        signal,
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8')
      });
    });
    child.on('error', (error) => {
      resolve({ exitCode: 1, signal: null, stdout: '', stderr: error.message });
    });
  });
}

function renderCommandLog(command: DesignCommandConfig, result: ShellResult): string {
  return [
    `# Reflection design command log`,
    ``,
    `Command: ${command.command}`,
    `CWD: ${command.cwd ?? process.cwd()}`,
    `Exit code: ${result.exitCode ?? 'signal'}`,
    result.signal ? `Signal: ${result.signal}` : undefined,
    ``,
    `## stdout`,
    ``,
    result.stdout || '(empty)',
    ``,
    `## stderr`,
    ``,
    result.stderr || '(empty)',
    ``
  ]
    .filter((line): line is string => line !== undefined)
    .join('\n');
}

function safeArtifactName(id: string): string {
  return id.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'command';
}
