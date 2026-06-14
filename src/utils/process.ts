import { spawn, type ChildProcess, type SpawnOptionsWithoutStdio } from 'node:child_process';
import { createWriteStream, type WriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { Readable } from 'node:stream';
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
  const closePromise = waitForChildClose(child);
  const logPipePromises: Array<Promise<void>> = [];

  if (logStream) {
    if (child.stdout) {
      logPipePromises.push(pipeRedactedLog(child.stdout, logStream));
    }
    if (child.stderr) {
      logPipePromises.push(pipeRedactedLog(child.stderr, logStream));
    }
  }

  return {
    pid: child.pid,
    stop: () => stopChildProcess(child, { closePromise, logPipePromises, logStream })
  };
}

type StopChildProcessOptions = {
  closePromise: Promise<void>;
  logPipePromises: Array<Promise<void>>;
  logStream: WriteStream | undefined;
};

async function stopChildProcess(child: ChildProcess, options: StopChildProcessOptions): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) {
    await options.closePromise;
    await Promise.allSettled(options.logPipePromises);
    await closeLogStream(options.logStream);
    return;
  }

  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) {
        killProcessGroup(child, 'SIGKILL');
      }
    }, 1_000);

    options.closePromise.then(() => {
      clearTimeout(timeout);
      resolve();
    });

    killProcessGroup(child, 'SIGTERM');
  });

  await Promise.allSettled(options.logPipePromises);
  await closeLogStream(options.logStream);
}

function waitForChildClose(child: ChildProcess): Promise<void> {
  return new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolve();
      return;
    }

    child.once('close', () => resolve());
  });
}

function pipeRedactedLog(source: Readable, logStream: WriteStream): Promise<void> {
  const redaction = createRedactionTransform();
  source.pipe(redaction).pipe(logStream, { end: false });

  return new Promise((resolve) => {
    let resolved = false;
    const finish = () => {
      if (resolved) {
        return;
      }

      resolved = true;
      resolve();
    };

    redaction.once('end', finish);
    redaction.once('close', finish);
    redaction.once('error', finish);
    source.once('error', finish);
  });
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
