import { spawn, type ChildProcess, type SpawnOptionsWithoutStdio } from 'node:child_process';
import { createWriteStream, type WriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createRedactionTransform } from '../core/redaction.js';

export type ManagedProcessOptions = {
  cwd?: string;
  logPath?: string;
};

export type ManagedProcess = {
  pid: number | undefined;
  stop: () => Promise<void>;
};

export async function spawnManagedProcess(command: string, options: ManagedProcessOptions = {}): Promise<ManagedProcess> {
  let logStream: WriteStream | undefined;
  if (options.logPath) {
    await mkdir(dirname(options.logPath), { recursive: true });
    logStream = createWriteStream(options.logPath, { flags: 'a' });
  }

  const spawnOptions: SpawnOptionsWithoutStdio = {
    detached: true,
    shell: true,
    stdio: 'pipe'
  };
  if (options.cwd) {
    spawnOptions.cwd = options.cwd;
  }

  const child = spawn(command, spawnOptions);
  child.stdin?.end();

  if (logStream) {
    child.stdout?.pipe(createRedactionTransform()).pipe(logStream, { end: false });
    child.stderr?.pipe(createRedactionTransform()).pipe(logStream, { end: false });
  }

  return {
    pid: child.pid,
    stop: () => stopChildProcess(child, logStream)
  };
}

async function stopChildProcess(child: ChildProcess, logStream?: WriteStream): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) {
    await closeLogStream(logStream);
    return;
  }

  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) {
        killProcessGroup(child, 'SIGKILL');
      }
    }, 1_000);

    child.once('close', () => {
      clearTimeout(timeout);
      resolve();
    });

    killProcessGroup(child, 'SIGTERM');
  });

  await closeLogStream(logStream);
}

function killProcessGroup(child: ChildProcess, signal: NodeJS.Signals): void {
  if (!child.pid) {
    return;
  }

  try {
    process.kill(-child.pid, signal);
  } catch {
    child.kill(signal);
  }
}

async function closeLogStream(logStream?: WriteStream): Promise<void> {
  if (!logStream || logStream.closed || logStream.destroyed) {
    return;
  }

  await new Promise<void>((resolve) => {
    logStream.end(resolve);
  });
}
