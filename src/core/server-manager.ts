import { spawnManagedProcess } from '../utils/process.js';

export type ServerConfig = {
  command: string;
  readyUrl: string;
  reuseExisting?: boolean;
  timeoutMs?: number;
};

export type StartManagedServerOptions = {
  cwd?: string;
  logPath?: string;
};

export type ManagedServer = {
  readyUrl: string;
  reused: boolean;
  started: boolean;
  pid: number | undefined;
  stop: () => Promise<void>;
};

export type WaitForUrlOptions = {
  timeoutMs?: number;
  intervalMs?: number;
};

export async function startManagedServer(config: ServerConfig, options: StartManagedServerOptions = {}): Promise<ManagedServer> {
  const timeoutMs = config.timeoutMs ?? 60_000;

  if (config.reuseExisting ?? true) {
    const existingReachable = await isUrlReachable(config.readyUrl);
    if (existingReachable) {
      return {
        readyUrl: config.readyUrl,
        reused: true,
        started: false,
        pid: undefined,
        stop: async () => undefined
      };
    }
  }

  const process = await spawnManagedProcess(config.command, options);

  try {
    await waitForUrl(config.readyUrl, { timeoutMs });
  } catch (error) {
    await process.stop();
    const logHint = options.logPath ? ` Logs: ${options.logPath}` : '';
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Reflection server did not become ready at ${config.readyUrl}: ${message}.${logHint}`);
  }

  return {
    readyUrl: config.readyUrl,
    reused: false,
    started: true,
    pid: process.pid,
    stop: process.stop
  };
}

export async function waitForUrl(url: string, options: WaitForUrlOptions = {}): Promise<void> {
  const timeoutMs = options.timeoutMs ?? 60_000;
  const intervalMs = options.intervalMs ?? 250;
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;

  while (Date.now() <= deadline) {
    if (await isUrlReachable(url).catch((error: unknown) => {
      lastError = error;
      return false;
    })) {
      return;
    }

    await sleep(intervalMs);
  }

  const reason = lastError instanceof Error ? ` Last error: ${lastError.message}` : '';
  throw new Error(`URL not reachable before timeout: ${url}.${reason}`);
}

async function isUrlReachable(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { cache: 'no-store' });
    await response.body?.cancel();
    return response.status >= 200 && response.status < 500;
  } catch {
    return false;
  }
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
