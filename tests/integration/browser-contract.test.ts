import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createArtifactStore } from '../../src/core/artifact-store.js';
import { startManagedServer, type ManagedServer } from '../../src/core/server-manager.js';
import { runBrowserContract } from '../../src/contracts/browser/browser-contract.js';

const activeServers: ManagedServer[] = [];

async function startBasicReactFixture(): Promise<string> {
  const readyUrl = 'http://127.0.0.1:5173';
  const server = await startManagedServer(
    {
      command: 'corepack pnpm dev --host 127.0.0.1',
      readyUrl,
      reuseExisting: true,
      timeoutMs: 10_000
    },
    {
      cwd: join(process.cwd(), 'examples/basic-react'),
      logPath: join(tmpdir(), `reflection-basic-react-${Date.now()}.log`)
    }
  );
  activeServers.push(server);
  return readyUrl;
}

afterEach(async () => {
  while (activeServers.length > 0) {
    const server = activeServers.pop();
    if (server) {
      await server.stop();
    }
  }
});

describe('browser contract', () => {
  it('passes the login route on desktop and mobile and writes screenshot artifacts', async () => {
    const baseUrl = await startBasicReactFixture();
    const rootDir = await mkdtemp(join(tmpdir(), 'reflection-browser-contract-pass-'));
    const store = await createArtifactStore({ rootDir, runId: 'browser-pass' });

    const checks = await runBrowserContract(
      {
        baseUrl,
        blocking: true,
        routes: [
          {
            id: 'login',
            path: '/login',
            viewports: ['desktop', 'mobile'],
            expects: [
              { role: 'heading', name: 'Login' },
              { label: 'Email' },
              { label: 'Password' },
              { role: 'button', name: 'Sign in' },
              { noText: 'Sign up' },
              { noText: 'Register' },
              { noHorizontalOverflow: true },
              { noConsoleErrors: true },
              { screenshot: 'final' }
            ]
          }
        ]
      },
      store
    );

    expect(checks).toHaveLength(2);
    expect(checks.map((check) => check.status)).toEqual(['pass', 'pass']);
    expect(checks.map((check) => check.id)).toEqual(['browser.login.desktop', 'browser.login.mobile']);

    for (const check of checks) {
      const screenshot = check.artifacts.find((artifact) => artifact.type === 'screenshot');
      expect(screenshot?.role).toBe('actual');
      expect(screenshot?.path).toMatch(/^browser\/login\/(desktop|mobile)\/actual\.png$/);
      await expect(readFile(store.resolveRunPath(screenshot?.path ?? ''))).resolves.toBeInstanceOf(Buffer);
    }
  }, 20_000);

  it('fails the intentional overflow and console error routes with clear classifications', async () => {
    const baseUrl = await startBasicReactFixture();
    const rootDir = await mkdtemp(join(tmpdir(), 'reflection-browser-contract-fail-'));
    const store = await createArtifactStore({ rootDir, runId: 'browser-fail' });

    const checks = await runBrowserContract(
      {
        baseUrl,
        blocking: true,
        routes: [
          {
            id: 'overflow',
            path: '/overflow',
            viewports: ['mobile'],
            expects: [{ noHorizontalOverflow: true }, { screenshot: 'final' }]
          },
          {
            id: 'console-error',
            path: '/console-error',
            viewports: ['desktop'],
            expects: [{ noConsoleErrors: true }, { screenshot: 'final' }]
          }
        ]
      },
      store
    );

    expect(checks).toHaveLength(2);
    expect(checks.map((check) => check.status)).toEqual(['fail', 'fail']);
    expect(checks.map((check) => check.severity)).toEqual(['blocking', 'blocking']);
    expect(checks[0]?.metadata.classification).toBe('layout-overflow');
    expect(checks[0]?.summary).toContain('horizontal overflow');
    expect(checks[1]?.metadata.classification).toBe('console-error');
    expect(checks[1]?.summary).toContain('console error');
    expect(checks.every((check) => check.artifacts.some((artifact) => artifact.type === 'screenshot'))).toBe(true);
  }, 20_000);
});
