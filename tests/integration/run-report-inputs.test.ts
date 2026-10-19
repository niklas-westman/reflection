import { createServer } from 'node:http';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CommanderError } from 'commander';
import { describe, expect, it, vi } from 'vitest';
import { PNG } from 'pngjs';
import { runCommand } from '../../src/commands/run.js';
import { validateReport, type ReflectionReport } from '../../src/core/report-schema.js';

const viewportSize = { width: 64, height: 48 };

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

async function writeSolidPng(path: string, rgba: [number, number, number, number]): Promise<void> {
  const png = new PNG({ width: viewportSize.width, height: viewportSize.height });
  for (let index = 0; index < viewportSize.width * viewportSize.height; index += 1) {
    png.data.set(rgba, index * 4);
  }
  await writeFile(path, PNG.sync.write(png));
}

interface Project {
  root: string;
  configPath: string;
  tokensPath: string;
  baselinePath: string;
}

async function createProject(options: { generatedByHook?: boolean } = {}): Promise<Project> {
  const root = await mkdtemp(join(tmpdir(), 'reflection-run-inputs-'));
  const port = await getFreePort();
  await mkdir(join(root, 'baselines'), { recursive: true });
  const entry = join(root, 'portal-entry.js');
  await writeFile(
    entry,
    `export function mountReflectionCase(input) {
  input.root.style.width = '100%';
  input.root.style.height = '100%';
  input.root.style.background = 'rgb(12, 34, 56)';
}
`,
    'utf8'
  );
  const baselinePath = join(root, 'baselines', 'swatch.png');
  await writeSolidPng(baselinePath, [12, 34, 56, 255]);
  const tokensPath = join(root, 'tokens.json');
  await writeFile(tokensPath, '{"b":2,"a":1}');
  const configPath = join(root, 'reflection.config.mjs');
  const config = {
    project: 'run-inputs-fixture',
    inputs: [{ role: 'source', path: 'tokens.json', canonical: 'json' }, ...(options.generatedByHook ? [{ role: 'generated', path: 'generated.json', canonical: 'json' }] : [])],
    ...(options.generatedByHook
      ? { lifecycle: { beforeRun: [{ id: 'generate', command: `node -e "require('fs').writeFileSync('generated.json', JSON.stringify({ generated: true }))"`, cwd: root, timeoutMs: 20_000, blocking: true }] } }
      : {}),
    meta: { provider: 'fixture' },
    contracts: {
      component: {
        portal: { entry, readyUrl: `http://127.0.0.1:${port}`, reuseExisting: false, timeoutMs: 20_000 },
        cases: [
          {
            id: 'swatch',
            path: '/reflection/swatch/light',
            viewport: 'swatch',
            viewportSize,
            baselineRoot: join(root, 'baselines'),
            baseline: 'swatch.png',
            ref: 'requirement-42',
            framing: { rootSelector: '#reflection-root', background: '#0c2238', align: 'start', padding: 0 },
            threshold: { maxDiffPixels: 0, maxDiffPixelRatio: 0 },
            strict: true
          }
        ]
      }
    }
  };
  await writeFile(configPath, `export default ${JSON.stringify(config)};\n`, 'utf8');
  return { root, configPath, tokensPath, baselinePath };
}

async function runVisual(project: Project, reportName: string): Promise<{ report: ReflectionReport; exitCode?: number }> {
  const reportDir = join(project.root, reportName);
  let exitCode: number | undefined;
  const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  try {
    await runCommand({ config: project.configPath, mode: 'visual', reportDir });
  } catch (caught) {
    if (!(caught instanceof CommanderError)) {
      throw caught;
    }
    exitCode = caught.exitCode;
  } finally {
    log.mockRestore();
    error.mockRestore();
  }

  const runId = (await readFile(join(reportDir, 'runs', 'latest'), 'utf8')).trim();
  const report = validateReport(JSON.parse(await readFile(join(reportDir, 'runs', runId, 'report.json'), 'utf8')));
  return { report, ...(exitCode !== undefined ? { exitCode } : {}) };
}

describe('run report inputs, ref, browser identity and result hash', () => {
  it('hashes an input that a setup hook generates, as the hook left it', async () => {
    const project = await createProject({ generatedByHook: true });

    const run = await runVisual(project, 'generated');

    const generated = run.report.inputs?.find((input) => input.role === 'generated');
    expect(generated).toMatchObject({ key: 'generated.json', hashKind: 'canonical-json' });
    expect(generated?.missing).not.toBe(true);
    expect(generated?.sha256).toMatch(/^[a-f0-9]{64}$/);
  }, 60_000);

  it('records what the run depended on and a verdict hash that is stable across identical runs', async () => {
    const project = await createProject();

    const first = await runVisual(project, 'first');
    // Run ids have one-second resolution, so wait out the second to get two different ids.
    await new Promise((resolve) => setTimeout(resolve, 1100));
    const second = await runVisual(project, 'second');

    expect(first.report.status).toBe('pass');
    expect(first.report.runId).not.toBe(second.report.runId);
    expect(first.report.resultHash?.verdict).toMatch(/^[a-f0-9]{64}$/);
    expect(second.report.resultHash?.verdict).toBe(first.report.resultHash?.verdict);
    expect(first.report.environment.browser).toMatchObject({ name: 'chromium' });
    expect(first.report.meta).toEqual({ provider: 'fixture' });
    expect(first.report.checks.find((check) => check.id === 'visual.swatch')?.metadata.ref).toBe('requirement-42');
    expect(first.report.inputs?.map((input) => `${input.role}:${input.key}:${input.hashKind}`)).toEqual([
      'baseline:baselines/swatch.png:bytes',
      'config:reflection.config.mjs:bytes',
      'source:tokens.json:canonical-json'
    ]);
    expect(JSON.stringify(first.report.inputs)).not.toContain(project.root);
  }, 60_000);

  it('keeps the canonical JSON input hash across reformatting and changes the verdict when the baseline changes', async () => {
    const project = await createProject();
    const before = await runVisual(project, 'before');

    await writeFile(project.tokensPath, '{\n  "a": 1,\n  "b": 2\n}\n');
    const reformatted = await runVisual(project, 'reformatted');
    await writeSolidPng(project.baselinePath, [255, 0, 0, 255]);
    const changedBaseline = await runVisual(project, 'changed-baseline');

    const tokenHash = (run: { report: ReflectionReport }): string | undefined => run.report.inputs?.find((input) => input.role === 'source')?.sha256;
    const baselineHash = (run: { report: ReflectionReport }): string | undefined => run.report.inputs?.find((input) => input.role === 'baseline')?.sha256;
    expect(tokenHash(reformatted)).toBe(tokenHash(before));
    expect(baselineHash(changedBaseline)).not.toBe(baselineHash(before));
    expect(changedBaseline.report.status).not.toBe('pass');
    expect(changedBaseline.report.resultHash?.verdict).not.toBe(before.report.resultHash?.verdict);
  }, 90_000);
});
