import { mkdir, mkdtemp, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateReflectionConfig } from '../../src/core/config.js';
import { hashReportInputs, listCaseBaselineFiles } from '../../src/core/input-hashing.js';

async function makeProject(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'reflection-inputs-'));
  await mkdir(join(root, 'source'), { recursive: true });
  return root;
}

describe('hashReportInputs', () => {
  it('hashes the config, baselines and declared inputs with keys relative to the config directory', async () => {
    const root = await makeProject();
    await writeFile(join(root, 'reflection.config.mjs'), 'export default {};');
    await writeFile(join(root, 'baseline.png'), 'png-bytes');
    await writeFile(join(root, 'source', 'tokens.json'), '{"a":1}');

    const inputs = await hashReportInputs({
      configDir: root,
      configFile: join(root, 'reflection.config.mjs'),
      declared: [{ role: 'source', path: 'source' }],
      baselineFiles: [join(root, 'baseline.png')]
    });

    expect(inputs.map((input) => `${input.role}:${input.key}`)).toEqual(['baseline:baseline.png', 'config:reflection.config.mjs', 'source:source/tokens.json']);
    expect(inputs.every((input) => /^[a-f0-9]{64}$/.test(input.sha256 ?? ''))).toBe(true);
    expect(JSON.stringify(inputs)).not.toContain(root);
  });

  it('changes a byte hash when the file changes', async () => {
    const root = await makeProject();
    await writeFile(join(root, 'baseline.png'), 'one');
    const before = await hashReportInputs({ configDir: root, declared: [], baselineFiles: [join(root, 'baseline.png')] });
    await writeFile(join(root, 'baseline.png'), 'two');
    const after = await hashReportInputs({ configDir: root, declared: [], baselineFiles: [join(root, 'baseline.png')] });

    expect(after[0]?.sha256).not.toBe(before[0]?.sha256);
  });

  it('hashes canonical JSON by content, so formatting does not change it but a value does', async () => {
    const root = await makeProject();
    const file = join(root, 'source', 'tokens.json');
    const declared = [{ role: 'source', path: 'source/tokens.json', canonical: 'json' as const }];

    await writeFile(file, '{"b":2,"a":1}');
    const compact = await hashReportInputs({ configDir: root, declared, baselineFiles: [] });
    await writeFile(file, '{\n  "a": 1,\n  "b": 2\n}\n');
    const pretty = await hashReportInputs({ configDir: root, declared, baselineFiles: [] });
    await writeFile(file, '{"a":1,"b":3}');
    const changed = await hashReportInputs({ configDir: root, declared, baselineFiles: [] });

    expect(compact[0]).toMatchObject({ hashKind: 'canonical-json' });
    expect(pretty[0]?.sha256).toBe(compact[0]?.sha256);
    expect(changed[0]?.sha256).not.toBe(compact[0]?.sha256);
  });

  it('records a missing file as missing without failing', async () => {
    const root = await makeProject();

    const inputs = await hashReportInputs({ configDir: root, declared: [{ role: 'source', path: 'source/absent.json' }], baselineFiles: [join(root, 'no-baseline.png')] });

    expect(inputs).toEqual([
      { role: 'baseline', key: 'no-baseline.png', hashKind: 'bytes', missing: true },
      { role: 'source', key: 'source/absent.json', hashKind: 'bytes', missing: true }
    ]);
  });

  it('rejects an input declared as canonical JSON that is not JSON', async () => {
    const root = await makeProject();
    await writeFile(join(root, 'source', 'broken.json'), '{not json');

    await expect(
      hashReportInputs({ configDir: root, declared: [{ role: 'source', path: 'source/broken.json', canonical: 'json' }], baselineFiles: [] })
    ).rejects.toThrow('not valid JSON');
  });

  it('walks directories deterministically and does not follow symlinks', async () => {
    const root = await makeProject();
    await mkdir(join(root, 'source', 'nested'), { recursive: true });
    await writeFile(join(root, 'source', 'b.txt'), 'b');
    await writeFile(join(root, 'source', 'nested', 'a.txt'), 'a');
    await symlink(root, join(root, 'source', 'loop'));

    const inputs = await hashReportInputs({ configDir: root, declared: [{ role: 'source', path: 'source' }], baselineFiles: [] });

    expect(inputs.map((input) => input.key)).toEqual(['source/b.txt', 'source/nested/a.txt']);
  });

  it('lists the same input once even when it is declared twice', async () => {
    const root = await makeProject();
    await writeFile(join(root, 'source', 'a.txt'), 'a');

    const inputs = await hashReportInputs({
      configDir: root,
      declared: [
        { role: 'source', path: 'source' },
        { role: 'source', path: 'source/a.txt' }
      ],
      baselineFiles: []
    });

    expect(inputs).toHaveLength(1);
  });
});

describe('listCaseBaselineFiles', () => {
  const config = validateReflectionConfig({
    project: 'inputs',
    contracts: {
      browser: {
        baseUrl: 'http://127.0.0.1:5173',
        routes: [],
        visualSmoke: [{ id: 'home', route: 'home', viewport: 'desktop', baseline: 'home.png', baselineRoot: '/baselines' }]
      },
      component: {
        portal: { entry: '/entry.js', readyUrl: 'http://127.0.0.1:5199' },
        cases: [{ id: 'button', path: '/button', viewportSize: { width: 10, height: 10 }, baseline: 'button.png', baselineRoot: '/baselines' }]
      }
    }
  });

  it('lists component baselines for visual mode and route baselines for smoke mode', () => {
    expect(listCaseBaselineFiles(config, 'visual')).toEqual(['/baselines/button.png']);
    expect(listCaseBaselineFiles(config, 'smoke')).toEqual(['/baselines/home.png']);
    expect(listCaseBaselineFiles(config, 'full')).toEqual(['/baselines/button.png', '/baselines/home.png']);
    expect(listCaseBaselineFiles(config, 'design')).toEqual([]);
  });
});
