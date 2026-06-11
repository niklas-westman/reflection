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
      command: 'pnpm dev --host 127.0.0.1',
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
  it('passes the login route, masks configured selectors, and warns about screenshot privacy', async () => {
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
            viewports: ['mobile'],
            expects: [{ screenshot: 'final' }]
          }
        ],
        maskSelectors: ['input[type="password"]']
      },
      store
    );

    expect(checks).toHaveLength(1);
    const check = checks[0];
    expect(check?.status).toBe('pass');
    expect(check?.id).toBe('browser.login.mobile');
    const screenshot = check?.artifacts.find((artifact) => artifact.type === 'screenshot');
    expect(screenshot?.role).toBe('actual');
    expect(screenshot?.path).toBe('browser/login/mobile/actual.png');
    await expect(readFile(store.resolveRunPath(screenshot?.path ?? ''))).resolves.toBeInstanceOf(Buffer);
    expect(check?.metadata.maskSelectors).toEqual(['input[type="password"]']);
    expect(check?.metadata.privacyWarning).toContain('Screenshots may contain private UI data');
    expect(check?.metadata.maskedSelectors).toEqual(['input[type="password"]']);
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

  it('applies browser and route storage setup before route navigation without leaking values to metadata', async () => {
    const baseUrl = await startBasicReactFixture();
    const rootDir = await mkdtemp(join(tmpdir(), 'reflection-browser-contract-setup-'));
    const store = await createArtifactStore({ rootDir, runId: 'browser-setup' });

    const checks = await runBrowserContract(
      {
        baseUrl,
        blocking: true,
        setup: {
          localStorage: {
            'reflection:auth-user': 'fixture-user-secret'
          }
        },
        routes: [
          {
            id: 'auth',
            path: '/auth',
            viewports: ['desktop'],
            setup: {
              sessionStorage: {
                'reflection:auth-session': 'fixture-session-secret'
              }
            },
            expects: [{ text: 'Authenticated fixture-user' }, { noConsoleErrors: true }]
          }
        ]
      },
      store
    );

    expect(checks).toHaveLength(1);
    const check = checks[0];
    expect(check?.status).toBe('pass');
    expect(check?.metadata.setup).toEqual({
      localStorageKeys: ['reflection:auth-user'],
      sessionStorageKeys: ['reflection:auth-session']
    });
    expect(JSON.stringify(check?.metadata)).not.toContain('fixture-user-secret');
    expect(JSON.stringify(check?.metadata)).not.toContain('fixture-session-secret');

    const metadataArtifact = check?.artifacts.find((artifact) => artifact.type === 'metadata' && artifact.path.endsWith('/metadata.json'));
    const metadata = await readFile(store.resolveRunPath(metadataArtifact?.path ?? ''), 'utf8');
    expect(metadata).toContain('reflection:auth-user');
    expect(metadata).toContain('reflection:auth-session');
    expect(metadata).not.toContain('fixture-user-secret');
    expect(metadata).not.toContain('fixture-session-secret');
  }, 20_000);
});
