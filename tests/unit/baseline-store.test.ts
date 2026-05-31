import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  createBaselineStore,
  createMissingBaselineCheck,
  readBaselineMetadata
} from '../../src/core/baseline-store.js';

async function makeTempDir() {
  const dir = join(tmpdir(), `reflection-baselines-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  await mkdir(dir, { recursive: true });
  return dir;
}

describe('createBaselineStore', () => {
  it('resolves baseline paths only inside the configured baseline root', async () => {
    const rootDir = await makeTempDir();
    const store = createBaselineStore({ rootDir });

    const resolved = store.resolveBaselinePath('browser/login/mobile.chromium-linux.light.png');

    expect(relative(rootDir, resolved)).toBe('browser/login/mobile.chromium-linux.light.png');
    expect(() => store.resolveBaselinePath('../outside.png')).toThrow(/outside baseline directory/);
    expect(() => store.resolveBaselinePath('/tmp/outside.png')).toThrow(/outside baseline directory/);
    expect(() => store.resolveBaselinePath('browser/../../outside.png')).toThrow(/outside baseline directory/);
  });

  it('can read baseline metadata without exposing a write/update API for normal runs', async () => {
    const rootDir = await makeTempDir();
    const metadataPath = join(rootDir, 'visual/button/secondary/metadata.json');
    await mkdir(join(rootDir, 'visual/button/secondary'), { recursive: true });
    await writeFile(
      metadataPath,
      JSON.stringify({ schemaVersion: 1, id: 'button-secondary-light-default', suite: 'visual' }),
      'utf8'
    );

    const store = createBaselineStore({ rootDir });
    const metadata = await readBaselineMetadata(store, 'visual/button/secondary/metadata.json');

    expect(metadata).toMatchObject({ id: 'button-secondary-light-default', suite: 'visual' });
    expect('writeBaseline' in store).toBe(false);
    expect('updateBaseline' in store).toBe(false);
    expect(await readFile(metadataPath, 'utf8')).toContain('button-secondary-light-default');
  });

  it('turns a missing baseline into a controlled review or blocking check', () => {
    const reviewCheck = createMissingBaselineCheck({
      id: 'visual.login-mobile',
      target: 'login mobile',
      baselinePath: 'browser/login/mobile.chromium-linux.light.png',
      blocking: false
    });
    const blockingCheck = createMissingBaselineCheck({
      id: 'visual.login-mobile',
      target: 'login mobile',
      baselinePath: 'browser/login/mobile.chromium-linux.light.png',
      blocking: true
    });

    expect(reviewCheck).toMatchObject({
      suite: 'visual',
      status: 'warn',
      severity: 'review',
      metadata: { classification: 'missing-baseline' }
    });
    expect(blockingCheck).toMatchObject({ status: 'fail', severity: 'blocking' });
  });
});
