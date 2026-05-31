import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = process.cwd();
const fixtureRoot = join(repoRoot, 'examples/basic-react');

async function readFixtureFile(relativePath: string): Promise<string> {
  return readFile(join(fixtureRoot, relativePath), 'utf8');
}

describe('basic React example fixture', () => {
  it('declares a runnable Vite React package', async () => {
    const packageJson = JSON.parse(await readFixtureFile('package.json')) as {
      scripts?: Record<string, string>;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };

    expect(packageJson.scripts?.dev).toContain('vite');
    expect(packageJson.scripts?.build).toContain('vite build');
    expect(packageJson.dependencies).toMatchObject({
      '@vitejs/plugin-react': expect.any(String),
      vite: expect.any(String),
      react: expect.any(String),
      'react-dom': expect.any(String)
    });
  });

  it('defines deterministic routes for a passing login case and two intentional failure cases', async () => {
    const source = await readFixtureFile('src/main.tsx');

    expect(source).toContain('window.__REFLECTION_READY__ = true');
    expect(source).toContain('Login');
    expect(source).toContain('Email');
    expect(source).toContain('Password');
    expect(source).toContain('Sign in');
    expect(source).not.toContain('Sign up');
    expect(source).not.toContain('Register');
    expect(source).toContain("case '/overflow'");
    expect(source).toContain("width: '120vw'");
    expect(source).toContain("case '/console-error'");
    expect(source).toContain("console.error('Reflection fixture intentional console error')");
  });

  it('declares Reflection browser route contracts for the fixture scenarios', async () => {
    const config = await readFixtureFile('reflection.config.ts');

    expect(config).toContain("project: 'basic-react'");
    expect(config).toContain("baseUrl: 'http://127.0.0.1:5173'");
    expect(config).toContain("command: 'corepack pnpm --dir examples/basic-react dev --host 127.0.0.1'");
    expect(config).toContain("readyUrl: 'http://127.0.0.1:5173'");
    expect(config).toContain("id: 'login'");
    expect(config).toContain("path: '/login'");
    expect(config).toContain("viewports: ['desktop', 'mobile']");
    expect(config).toContain("{ role: 'heading', name: 'Login' }");
    expect(config).toContain("{ label: 'Email' }");
    expect(config).toContain("{ label: 'Password' }");
    expect(config).toContain("{ role: 'button', name: 'Sign in' }");
    expect(config).toContain("{ noText: 'Sign up' }");
    expect(config).toContain("{ noText: 'Register' }");
    expect(config).toContain('{ noHorizontalOverflow: true }');
    expect(config).toContain('{ noConsoleErrors: true }');
    expect(config).toContain("{ screenshot: 'final' }");
    expect(config).toContain("id: 'overflow'");
    expect(config).toContain("path: '/overflow'");
    expect(config).toContain("id: 'console-error'");
    expect(config).toContain("path: '/console-error'");
  });
});
