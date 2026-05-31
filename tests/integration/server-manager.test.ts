import { createServer, type Server } from 'node:http';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { startManagedServer, waitForUrl } from '../../src/core/server-manager.js';

const activeStops: Array<() => Promise<void>> = [];

async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('Failed to allocate a TCP port')));
        return;
      }

      const { port } = address;
      server.close(() => resolve(port));
    });
  });
}

async function startTestHttpServer(port: number): Promise<Server> {
  const server = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/plain' });
    response.end('ok');
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });

  return server;
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

afterEach(async () => {
  while (activeStops.length > 0) {
    const stop = activeStops.pop();
    if (stop) {
      await stop();
    }
  }
});

describe('server manager', () => {
  it('reuses an already reachable readyUrl when reuseExisting is enabled', async () => {
    const port = await getFreePort();
    const readyUrl = `http://127.0.0.1:${port}`;
    const existingServer = await startTestHttpServer(port);
    activeStops.push(() => closeServer(existingServer));

    const managed = await startManagedServer({
      command: 'node -e "process.exit(42)"',
      readyUrl,
      reuseExisting: true,
      timeoutMs: 1_000
    });

    expect(managed.reused).toBe(true);
    expect(managed.started).toBe(false);

    await managed.stop();
    const response = await fetch(readyUrl);
    expect(response.status).toBe(200);
  });

  it('starts a configured command, waits for readiness, writes logs, and kills only the owned process', async () => {
    const port = await getFreePort();
    const readyUrl = `http://127.0.0.1:${port}`;
    const workdir = await mkdtemp(join(tmpdir(), 'reflection-server-manager-'));
    const logPath = join(workdir, 'server.log');
    const command = `node -e "const http = require('node:http'); const server = http.createServer((_req, res) => res.end('fixture ok')); server.listen(${port}, '127.0.0.1', () => console.log('fixture ready')); setInterval(() => {}, 1000);"`;

    const managed = await startManagedServer(
      {
        command,
        readyUrl,
        reuseExisting: false,
        timeoutMs: 5_000
      },
      { cwd: workdir, logPath }
    );
    activeStops.push(managed.stop);

    expect(managed.reused).toBe(false);
    expect(managed.started).toBe(true);
    expect(managed.pid).toEqual(expect.any(Number));
    await expect(waitForUrl(readyUrl, { timeoutMs: 500 })).resolves.toBeUndefined();
    await expect(readFile(logPath, 'utf8')).resolves.toContain('fixture ready');

    await managed.stop();
    activeStops.pop();
    await expect(waitForUrl(readyUrl, { timeoutMs: 250, intervalMs: 50 })).rejects.toThrow(/not reachable/i);
  });

  it('captures server logs and terminates the owned process when readiness times out', async () => {
    const port = await getFreePort();
    const readyUrl = `http://127.0.0.1:${port}`;
    const workdir = await mkdtemp(join(tmpdir(), 'reflection-server-manager-fail-'));
    const logPath = join(workdir, 'server.log');

    await expect(
      startManagedServer(
        {
          command: "node -e \"console.error('fixture startup failure'); setInterval(() => {}, 1000);\"",
          readyUrl,
          reuseExisting: false,
          timeoutMs: 250
        },
        { cwd: workdir, logPath }
      )
    ).rejects.toThrow(/server did not become ready/i);

    await expect(readFile(logPath, 'utf8')).resolves.toContain('fixture startup failure');
    await expect(waitForUrl(readyUrl, { timeoutMs: 100, intervalMs: 25 })).rejects.toThrow(/not reachable/i);
  });
});
