import { createHash } from 'node:crypto';
import { cp, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  createFixtureCase,
  fixturesRoot,
  interLabel,
  loraCaption,
  runFixtureCase,
  startFixtureServer,
  type FixtureRun,
  type FixtureServer,
  type FixtureSpec,
  type PageOverrides
} from '../helpers/text-diagnostics-fixture.js';
import type { Observation, TextDiagnosticsRecord } from '../../src/diagnostics/text/record.js';

let server: FixtureServer;

beforeAll(async () => {
  server = await startFixtureServer([interLabel, loraCaption]);
});

afterAll(async () => {
  await server.close();
});

afterEach(() => {
  server.setOverrides(interLabel.storyId, {});
  server.setOverrides(loraCaption.storyId, {});
  server.requests.length = 0;
});

function sha(bytes: Buffer | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function recordOf(run: FixtureRun): TextDiagnosticsRecord {
  expect(run.record, 'text diagnostics record').toBeDefined();
  return run.record as TextDiagnosticsRecord;
}

function observation(record: TextDiagnosticsRecord, field: string): Observation {
  const found = record.parts[0]?.observations.find((candidate) => candidate.field === field);
  expect(found, `observation ${field}`).toBeDefined();
  return found as Observation;
}

async function fileSha(run: FixtureRun, path: string): Promise<string> {
  return sha(await readFile(run.resolveRunPath(path)));
}

async function copyBundle(id: string): Promise<{ dir: string; bundlePath: string; read(): Promise<Record<string, any>>; write(bundle: Record<string, any>): Promise<void> }> {
  const dir = await mkdtemp(join(tmpdir(), 'reflection-text-diag-bundle-'));
  await cp(join(fixturesRoot, id), dir, { recursive: true });
  const bundlePath = join(dir, 'bundle.json');
  return {
    dir,
    bundlePath,
    read: async () => JSON.parse(await readFile(bundlePath, 'utf8')) as Record<string, any>,
    write: (bundle) => writeFile(bundlePath, `${JSON.stringify(bundle, null, 2)}\n`)
  };
}

const nativeMetadataKeys = ['classification', 'diffPixels', 'diffRatio', 'width', 'height', 'dimensionMismatch', 'expectedFormat', 'status', 'threshold'] as const;

describe('text diagnostics leave the native outcome alone', () => {
  it('produces an identical native result, artifacts and screenshot with and without diagnostics', async () => {
    const without = await runFixtureCase({ baseUrl: server.baseUrl, spec: interLabel });
    const withDiagnostics = await runFixtureCase({ baseUrl: server.baseUrl, spec: interLabel, withDiagnostics: true });

    expect(without.check.status).toBe('fail');
    expect(withDiagnostics.check.status).toBe(without.check.status);
    expect(withDiagnostics.check.severity).toBe(without.check.severity);
    expect(withDiagnostics.check.summary).toBe(without.check.summary);
    expect(withDiagnostics.check.details).toBe(without.check.details);
    for (const key of nativeMetadataKeys) {
      expect(withDiagnostics.check.metadata[key], key).toEqual(without.check.metadata[key]);
    }

    const nativeRoles = ['expected', 'actual', 'diff'];
    const nativeArtifacts = (run: FixtureRun) => run.check.artifacts.filter((artifact) => nativeRoles.includes(artifact.role ?? '')).map((artifact) => [artifact.role, artifact.path, artifact.sha256]);
    expect(nativeArtifacts(withDiagnostics)).toEqual(nativeArtifacts(without));
    expect(await fileSha(withDiagnostics, 'visual/inter-label/actual.png')).toBe(await fileSha(without, 'visual/inter-label/actual.png'));

    expect(without.check.metadata.textDiagnostics).toBeUndefined();
    expect(without.check.artifacts).toHaveLength(3);
    const baseDiagnostics = without.check.diagnostics ?? [];
    expect(withDiagnostics.check.diagnostics?.slice(0, baseDiagnostics.length)).toEqual(baseDiagnostics);
    expect(withDiagnostics.check.diagnostics?.at(-1)).toMatchObject({ kind: 'text-diagnostics', severity: 'info' });
    expect(withDiagnostics.check.diagnostics?.at(-1)?.message).toContain('the native screenshot outcome is unchanged');
  }, 60_000);

  it('records the unchanged native outcome and never claims compliance', async () => {
    const run = await runFixtureCase({ baseUrl: server.baseUrl, spec: interLabel, withDiagnostics: true });
    const record = recordOf(run);

    expect(record.nativeOutcome).toEqual({
      status: 'fail',
      classification: 'visual-diff',
      diffPixels: run.check.metadata.diffPixels,
      diffRatio: run.check.metadata.diffRatio,
      threshold: { maxDiffPixels: 0, maxDiffPixelRatio: 0 },
      unchanged: true
    });
    expect(record.statement).toContain('does not change the native screenshot outcome, grant compliance');
    expect(run.check.status).toBe('fail');
    expect(run.check.severity).toBe('blocking');
  }, 40_000);
});

describe('the Marwes-like fixture (Inter label, live unversioned source)', () => {
  it('shows independent outline diagnostics beside a failed native screenshot', async () => {
    const run = await runFixtureCase({ baseUrl: server.baseUrl, spec: interLabel, withDiagnostics: true });
    const record = recordOf(run);
    const nativePixels = run.check.metadata.diffPixels as number;

    expect(record).toMatchObject({ schema: 'reflection.text-diagnostics/v1', state: 'available', runId: 'text-diagnostics', caseId: 'inter-label', reasons: [] });
    expect(nativePixels).toBeGreaterThan(0);
    expect(record.experiments.map((experiment) => [experiment.id, experiment.state])).toEqual([
      ['frame-render', 'available'],
      ['part-overlay:refresh-label', 'available']
    ]);
    for (const experiment of record.experiments) {
      expect(experiment.measurement?.totalDiffPixels, experiment.id).toBeLessThan(nativePixels);
      expect(experiment.nativeMeasurement?.totalDiffPixels).toBe(nativePixels);
      expect(experiment.measurement?.regionDiffPixels).toBeLessThanOrEqual(experiment.measurement?.totalDiffPixels ?? 0);
    }
    expect(record.inference).toMatchObject({ id: 'native-text-vector-rendering-discrepancy-suspected', confidence: 'low' });
    expect(record.inference?.limitations).toContain('The authoring version of the source is not independently known.');
    expect(record.shaping.state).toBe('unsupported');
  }, 40_000);

  it('binds source facts, fractional coordinates and direct versus inferred measurements', async () => {
    const record = recordOf(await runFixtureCase({ baseUrl: server.baseUrl, spec: interLabel, withDiagnostics: true }));

    expect(record.source).toMatchObject({
      scope: 'live-diagnostic',
      sourceVersion: null,
      fileIdentity: { reportedId: null, attestedId: 'fixture-file-a', verification: 'caller-attested' }
    });
    expect(observation(record, 'box.x')).toMatchObject({ source: 55.595977, comparison: 'match', sourceBasis: 'provided', runtimeBasis: 'observed' });
    expect(observation(record, 'box.x').delta).toBe((observation(record, 'box.x').runtime as number) - 55.595977);
    expect(Math.abs(observation(record, 'box.x').delta ?? 1)).toBeLessThan(0.05);
    expect(observation(record, 'baseline.y')).toMatchObject({ source: 37.092773, sourceBasis: 'inferred', runtimeBasis: 'observed' });
    expect(observation(record, 'font.identity')).toMatchObject({ comparison: 'match', runtimeBasis: 'cdp-platform-fonts' });
    expect(record.parts[0]?.runtime?.platformFonts?.[0]).toMatchObject({ postScriptName: 'Inter-Medium', isCustomFont: true });
    expect(record.parts[0]?.evidence.missing).toEqual(expect.arrayContaining(['source.font-asset-checksum', 'source.baseline-direct']));
    expect(record.conversions.map((conversion) => conversion.field)).toEqual(expect.arrayContaining(['box', 'refresh-label.letterSpacing']));
  }, 40_000);

  it('records the loaded font faces and the hash of the downloaded font file', async () => {
    const record = recordOf(await runFixtureCase({ baseUrl: server.baseUrl, spec: interLabel, withDiagnostics: true }));
    const fontBytes = await readFile(join(fixturesRoot, 'inter-label/font/inter-latin-500-normal.woff'));

    expect(record.runtime?.fontsStatus).toBe('loaded');
    expect(record.runtime?.fontFaces).toEqual([{ family: 'Inter', weight: '500', style: 'normal', stretch: 'normal', status: 'loaded' }]);
    expect(record.runtime?.fontResponses).toEqual([expect.objectContaining({ status: 200, bytes: fontBytes.length, sha256: sha(fontBytes) })]);
    expect(record.runtime?.devicePixelRatio).toBe(1);
    expect(record.inputs?.tool.browser?.name).toBe('chromium');
  }, 40_000);

  it('labels every artifact with an explicit role that matches the check artifacts', async () => {
    const run = await runFixtureCase({ baseUrl: server.baseUrl, spec: interLabel, withDiagnostics: true });
    const record = recordOf(run);

    expect(record.artifacts.map((artifact) => artifact.role).sort()).toEqual(
      ['comparison-image', 'comparison-image', 'diagnostic-render', 'diagnostic-render', 'implementation-screenshot', 'native-diff', 'reference-image', 'source-outline', 'source-outline'].sort()
    );
    for (const artifact of record.artifacts) {
      const attached = run.check.artifacts.find((candidate) => candidate.path === artifact.path);
      expect(attached, artifact.path).toBeDefined();
      expect(attached?.sha256).toBe(artifact.sha256);
      expect(await fileSha(run, artifact.path)).toBe(artifact.sha256);
    }
    expect(run.check.artifacts.find((candidate) => candidate.path.endsWith('text-diagnostics/record.json'))).toMatchObject({ type: 'metadata', role: 'evidence' });
    expect(record.artifacts.find((artifact) => artifact.role === 'reference-image')?.path).toBe('visual/inter-label/expected.png');
    expect(record.artifacts.find((artifact) => artifact.role === 'implementation-screenshot')?.path).toBe('visual/inter-label/actual.png');
  }, 40_000);

  it('writes diagnostic renders at the reference size without touching the real screenshot', async () => {
    const run = await runFixtureCase({ baseUrl: server.baseUrl, spec: interLabel, withDiagnostics: true });
    const record = recordOf(run);

    for (const experiment of record.experiments) {
      const meta = await sharp(run.resolveRunPath(experiment.render?.path ?? '')).metadata();
      expect([meta.width, meta.height]).toEqual([160, 64]);
    }
    const actual = await sharp(run.resolveRunPath('visual/inter-label/actual.png')).metadata();
    expect([actual.width, actual.height]).toEqual([160, 64]);
  }, 40_000);

  it('is reproducible: the same inputs and run id give the same binding key, a new run id does not', async () => {
    const first = recordOf(await runFixtureCase({ baseUrl: server.baseUrl, spec: interLabel, withDiagnostics: true, runId: 'run-a' }));
    const again = recordOf(await runFixtureCase({ baseUrl: server.baseUrl, spec: interLabel, withDiagnostics: true, runId: 'run-a' }));
    const other = recordOf(await runFixtureCase({ baseUrl: server.baseUrl, spec: interLabel, withDiagnostics: true, runId: 'run-b' }));

    expect(first.inputs?.bindingKey).toMatch(/^[a-f0-9]{64}$/);
    expect(again.inputs?.bindingKey).toBe(first.inputs?.bindingKey);
    expect(other.inputs?.bindingKey).not.toBe(first.inputs?.bindingKey);
  }, 60_000);

  it('changes the binding key when an outlined SVG changes, even with a consistent hash', async () => {
    const baseline = recordOf(await runFixtureCase({ baseUrl: server.baseUrl, spec: interLabel, withDiagnostics: true }));
    const copy = await copyBundle('inter-label');
    const path = join(copy.dir, 'source/label.svg');
    const changed = Buffer.from((await readFile(path, 'utf8')).replace('translate(0 ', 'translate(0.2 '));
    await writeFile(path, changed);
    const bundle = await copy.read();
    Object.assign(bundle.outlines[1], { bytes: changed.length, sha256: sha(changed) });
    await copy.write(bundle);

    const stale = recordOf(await runFixtureCase({ baseUrl: server.baseUrl, spec: interLabel, withDiagnostics: true, bundlePath: copy.bundlePath }));

    expect(stale.state).toBe('available');
    expect(stale.inputs?.bindingKey).not.toBe(baseline.inputs?.bindingKey);
    expect(stale.inputs?.outlines.find((outline) => outline.id === 'label')?.sha256).toBe(sha(changed));
  }, 60_000);

  it('can disable experiments, leaving observations and an honest insufficient-evidence inference', async () => {
    const run = await runFixtureCase({
      baseUrl: server.baseUrl,
      spec: interLabel,
      withDiagnostics: true,
      caseOverrides: {
        textDiagnostics: { source: join(fixturesRoot, 'inter-label/bundle.json'), parts: [{ id: 'refresh-label', selector: '.label' }], context: interLabel.context, experiments: { frameRender: false, partOverlay: false } }
      }
    });
    const record = recordOf(run);

    expect(record.experiments).toEqual([]);
    expect(record.inference?.id).toBe('insufficient-evidence');
    expect(record.parts[0]?.observations.length).toBeGreaterThan(5);
  }, 40_000);
});

describe('font identity with a CSS family alias (real web font)', () => {
  // Inter registers under CSS family "Inter" while Chromium reports the font's internal name "Inter Medium",
  // the same shape as the reported Instrument Sans case. Only the source facts change; the bundle hashes do not.
  async function withSourceFacts(facts: Record<string, unknown>): Promise<string> {
    const copy = await copyBundle('inter-label');
    const bundle = await copy.read();
    const { postScriptName: _removed, ...rest } = bundle.parts[0].typography;
    bundle.parts[0].typography = { ...rest, ...facts };
    await copy.write(bundle);
    return copy.bundlePath;
  }

  it('is a name-level match, not a fallback claim, when the source names family and style but no PostScript name', async () => {
    const run = await runFixtureCase({ baseUrl: server.baseUrl, spec: interLabel, withDiagnostics: true, bundlePath: await withSourceFacts({ style: 'Medium' }) });
    const record = recordOf(run);
    const identity = observation(record, 'font.identity');

    expect(identity).toMatchObject({ comparison: 'match', classification: 'style-qualified-family-alias', source: { family: 'Inter', style: 'Medium', postScriptName: null } });
    expect(identity.runtime).toEqual([expect.objectContaining({ familyName: 'Inter Medium', isCustomFont: true })]);
    expect(record.inference?.id).toBe('native-text-vector-rendering-discrepancy-suspected');
    expect(record.inference?.confidence).toBe('low');
    expect(record.parts[0]?.evidence.missing).toEqual(expect.arrayContaining(['source.postscript-name', 'source.font-asset-checksum']));
    expect(run.check.status).toBe('fail');
  }, 40_000);

  it('reports uncertainty with raw names when the source gives no style to tie the qualifier to', async () => {
    const record = recordOf(await runFixtureCase({ baseUrl: server.baseUrl, spec: interLabel, withDiagnostics: true, bundlePath: await withSourceFacts({}) }));
    const identity = observation(record, 'font.identity');

    expect(identity).toMatchObject({ comparison: 'unknown', classification: 'name-extends-source-family' });
    expect(identity.runtime).toEqual([expect.objectContaining({ familyName: 'Inter Medium', postScriptName: 'Inter-Medium' })]);
    expect(record.inference?.id).not.toBe('font-identity-mismatch-observed');
    expect(record.parts[0]?.evidence.missing).toContain('runtime.font-identity-unestablished');
  }, 40_000);

  it('keeps a conflicting source style visible', async () => {
    const record = recordOf(await runFixtureCase({ baseUrl: server.baseUrl, spec: interLabel, withDiagnostics: true, bundlePath: await withSourceFacts({ style: 'Bold' }) }));

    expect(observation(record, 'font.identity')).toMatchObject({ comparison: 'mismatch', classification: 'style-qualifier-conflict' });
    expect(record.inference?.id).toBe('font-identity-mismatch-observed');
  }, 40_000);

  it('still detects a true system fallback when the source names family and style', async () => {
    server.setOverrides(interLabel.storyId, { fontFamily: 'NoSuchFontFamilyXyz', omitFontFace: true });

    const record = recordOf(await runFixtureCase({ baseUrl: server.baseUrl, spec: interLabel, withDiagnostics: true, bundlePath: await withSourceFacts({ style: 'Medium' }) }));

    expect(observation(record, 'font.identity')).toMatchObject({ comparison: 'mismatch', classification: 'system-font-mismatch' });
    expect(record.inference?.id).toBe('font-identity-mismatch-observed');
  }, 40_000);

  it('keeps native outcomes and artifacts unchanged', async () => {
    const without = await runFixtureCase({ baseUrl: server.baseUrl, spec: interLabel });
    const withDiagnostics = await runFixtureCase({ baseUrl: server.baseUrl, spec: interLabel, withDiagnostics: true, bundlePath: await withSourceFacts({ style: 'Medium' }) });

    expect(withDiagnostics.check.status).toBe(without.check.status);
    expect(withDiagnostics.check.metadata.diffPixels).toBe(without.check.metadata.diffPixels);
    expect(await fileSha(withDiagnostics, 'visual/inter-label/actual.png')).toBe(await fileSha(without, 'visual/inter-label/actual.png'));
    expect(recordOf(withDiagnostics).schema).toBe('reflection.text-diagnostics/v1');
  }, 60_000);
});

describe('a second, non-Marwes fixture (Lora caption, pinned versioned source)', () => {
  it('works offline with different font, string, theme and identity', async () => {
    const run = await runFixtureCase({ baseUrl: server.baseUrl, spec: loraCaption, withDiagnostics: true });
    const record = recordOf(run);

    expect(record.state).toBe('available');
    expect(record.source).toMatchObject({ scope: 'pinned', sourceVersion: 'fixture-2026-10-16', fileIdentity: { reportedId: 'fixture-file-b', attestedId: null, verification: 'reported' } });
    expect(observation(record, 'text')).toMatchObject({ source: 'Skicka åäö', runtime: 'Skicka åäö', comparison: 'match' });
    expect(observation(record, 'font.identity').comparison).toBe('match');
    expect(record.inference?.id).toBe('native-text-vector-rendering-discrepancy-suspected');
    // The authoring-font checksum is explicitly unknown, so the claim stays low even for a pinned, versioned source.
    expect(record.inference?.confidence).toBe('low');
    expect(run.check.status).toBe('fail');
    expect(JSON.stringify(record).toLowerCase()).not.toMatch(/figma|marwes/);
  }, 40_000);
});

describe('defects stay visible', () => {
  const defects: Array<{ name: string; overrides: PageOverrides; fields: string[]; inference?: string }> = [
    { name: 'wrong font size', overrides: { size: 15 }, fields: ['font.size'] },
    { name: 'wrong weight', overrides: { weight: 700 }, fields: ['font.weight'] },
    { name: 'wrong tracking', overrides: { letterSpacing: '0px' }, fields: ['letterSpacing'] },
    { name: 'wrong text', overrides: { text: 'Reload' }, fields: ['text'] },
    { name: 'wrong line height', overrides: { lineHeight: 20 }, fields: ['lineHeight'] },
    { name: 'wrong color', overrides: { color: '#ff0000' }, fields: ['color'] },
    { name: 'a transform', overrides: { labelStyle: 'transform: translateX(3px)' }, fields: ['transform', 'box.x'] },
    { name: 'a baseline shift', overrides: { labelStyle: 'position: relative; top: 2px' }, fields: ['box.y', 'baseline.y'] },
    { name: 'a fallback font', overrides: { fontFamily: 'NoSuchFontFamilyXyz', omitFontFace: true }, fields: ['font.identity'], inference: 'font-identity-mismatch-observed' }
  ];

  it.each(defects)('flags $name and withholds a rendering-path explanation', async ({ overrides, fields, inference }) => {
    server.setOverrides(interLabel.storyId, overrides);

    const run = await runFixtureCase({ baseUrl: server.baseUrl, spec: interLabel, withDiagnostics: true });
    const record = recordOf(run);

    expect(run.check.status).toBe('fail');
    for (const field of fields) {
      expect(observation(record, field).comparison, field).toBe('mismatch');
    }
    expect(record.inference?.id).toBe(inference ?? 'typography-or-geometry-mismatch-observed');
    expect(record.inference?.supportedBy.length).toBeGreaterThan(0);
  }, 40_000);

  it('does not let a good diagnostic render hide a shifted string: the overlay stays independent of the real text', async () => {
    server.setOverrides(interLabel.storyId, { labelStyle: 'transform: translateX(6px)' });

    const record = recordOf(await runFixtureCase({ baseUrl: server.baseUrl, spec: interLabel, withDiagnostics: true }));
    const overlay = record.experiments.find((experiment) => experiment.kind === 'part-overlay');

    expect(overlay?.state).toBe('available');
    expect(overlay?.measurement?.totalDiffPixels).toBeLessThan(record.nativeOutcome.diffPixels);
    expect(record.inference?.id).not.toBe('native-text-vector-rendering-discrepancy-suspected');
    expect(observation(record, 'box.x').delta).toBeGreaterThan(5);
  }, 40_000);

  it('reports a selector that no longer matches exactly one element and runs nothing against it', async () => {
    const run = await runFixtureCase({
      baseUrl: server.baseUrl,
      spec: interLabel,
      caseOverrides: { textDiagnostics: { source: join(fixturesRoot, 'inter-label/bundle.json'), parts: [{ id: 'refresh-label', selector: '.does-not-exist' }], context: interLabel.context } }
    });
    const record = recordOf(run);

    expect(observation(record, 'selector.matchCount')).toMatchObject({ runtime: 0, comparison: 'mismatch' });
    expect(record.experiments.find((experiment) => experiment.kind === 'part-overlay')).toMatchObject({ state: 'skipped', reason: 'selector-not-found' });
    expect(record.inference?.id).toBe('insufficient-evidence');
    expect(run.check.status).toBe('fail');
  }, 40_000);
});

describe('rejected input is described, never shown as evidence', () => {
  function expectRejected(run: FixtureRun, code: string, state: 'invalid' | 'unsupported' = 'invalid'): void {
    const record = recordOf(run);
    expect(record.state).toBe(state);
    expect(record.reasons.map((reason) => reason.code)).toContain(code);
    expect(record.parts).toEqual([]);
    expect(record.experiments).toEqual([]);
    expect(record.artifacts).toEqual([]);
    expect(record.inference).toBeNull();
    expect(record.inputs).toBeNull();
    const diagnosticArtifacts = run.check.artifacts.filter((artifact) => artifact.path.includes('text-diagnostics/'));
    expect(diagnosticArtifacts.map((artifact) => artifact.path)).toEqual(['visual/inter-label/text-diagnostics/record.json']);
    // Rejection never changes the native result.
    expect(run.check.status).toBe('fail');
  }

  it('rejects a bundle for a different theme, adapter or stage', async () => {
    const run = await runFixtureCase({ baseUrl: server.baseUrl, spec: interLabel, withDiagnostics: true, context: { theme: 'light', adapter: 'fixture-html' } });

    expectRejected(run, 'context-mismatch');
    expect(recordOf(run).reasons[0]?.message).toContain('different adapter, theme or stage');
  }, 40_000);

  it('rejects a context key the bundle does not declare', async () => {
    expectRejected(await runFixtureCase({ baseUrl: server.baseUrl, spec: interLabel, withDiagnostics: true, context: { stage: 'staged' } }), 'context-mismatch');
  }, 40_000);

  it('rejects a tampered SVG', async () => {
    const copy = await copyBundle('inter-label');
    const path = join(copy.dir, 'source/frame.svg');
    await writeFile(path, (await readFile(path, 'utf8')).replace('#375dfb', '#375dfc'));

    expectRejected(await runFixtureCase({ baseUrl: server.baseUrl, spec: interLabel, withDiagnostics: true, bundlePath: copy.bundlePath }), 'artifact-hash-mismatch');
  }, 40_000);

  it('rejects a tampered bundle reference image', async () => {
    const copy = await copyBundle('inter-label');
    const path = join(copy.dir, 'reference/reference.webp');
    const bytes = await readFile(path);
    bytes[bytes.length - 2] = (bytes[bytes.length - 2] ?? 0) ^ 0x01;
    await writeFile(path, bytes);

    expectRejected(await runFixtureCase({ baseUrl: server.baseUrl, spec: interLabel, withDiagnostics: true, bundlePath: copy.bundlePath }), 'artifact-hash-mismatch');
  }, 40_000);

  it('rejects a bundle whose reference is not the image this comparison uses as its baseline', async () => {
    const baselineRoot = await mkdtemp(join(tmpdir(), 'reflection-text-diag-baseline-'));
    const decoded = await sharp(join(fixturesRoot, 'inter-label/reference/reference.webp')).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    decoded.data[0] = (decoded.data[0] ?? 0) ^ 0xff;
    await sharp(decoded.data, { raw: { width: decoded.info.width, height: decoded.info.height, channels: 4 } })
      .webp({ lossless: true, exact: true })
      .toFile(join(baselineRoot, 'reference.webp'));

    const run = await runFixtureCase({ baseUrl: server.baseUrl, spec: interLabel, withDiagnostics: true, caseOverrides: { baselineRoot } });

    expectRejected(run, 'reference-differs-from-baseline');
  }, 40_000);

  it('accepts a bundle reference that is the same pixels in a different encoding', async () => {
    const baselineRoot = await mkdtemp(join(tmpdir(), 'reflection-text-diag-baseline-'));
    await sharp(join(fixturesRoot, 'inter-label/reference/reference.webp')).png().toFile(join(baselineRoot, 'reference.webp'));

    const record = recordOf(await runFixtureCase({ baseUrl: server.baseUrl, spec: interLabel, withDiagnostics: true, caseOverrides: { baselineRoot } }));

    expect(record.state).toBe('available');
    expect(record.inputs?.referenceBinding).toBe('identical-pixels');
  }, 40_000);

  it('rejects a bundle for a different viewport', async () => {
    const run = await runFixtureCase({ baseUrl: server.baseUrl, spec: interLabel, withDiagnostics: true, caseOverrides: { viewportSize: { width: 200, height: 72 } } });

    expectRejected(run, 'viewport-mismatch');
  }, 40_000);

  it('rejects a bundle at a device scale Reflection does not capture', async () => {
    const copy = await copyBundle('inter-label');
    const doubled = await sharp(join(copy.dir, 'reference/reference.webp')).resize(320, 128, { kernel: 'nearest' }).webp({ lossless: true }).toBuffer();
    await writeFile(join(copy.dir, 'reference/reference.webp'), doubled);
    const bundle = await copy.read();
    bundle.viewport.deviceScaleFactor = 2;
    Object.assign(bundle.reference, { bytes: doubled.length, sha256: sha(doubled) });
    await copy.write(bundle);

    const run = await runFixtureCase({ baseUrl: server.baseUrl, spec: interLabel, withDiagnostics: true, bundlePath: copy.bundlePath });

    expect(recordOf(run).state).toBe('invalid');
    expect(recordOf(run).reasons.map((reason) => reason.code)).toEqual(expect.arrayContaining(['dpr-mismatch', 'reference-differs-from-baseline']));
  }, 40_000);

  it('rejects a configured part the bundle does not know', async () => {
    const run = await runFixtureCase({
      baseUrl: server.baseUrl,
      spec: interLabel,
      caseOverrides: { textDiagnostics: { source: join(fixturesRoot, 'inter-label/bundle.json'), parts: [{ id: 'unknown-part', selector: '.label' }], context: interLabel.context } }
    });

    expectRejected(run, 'unknown-part');
  }, 40_000);

  it('rejects a missing bundle file as invalid without failing the run', async () => {
    const run = await runFixtureCase({ baseUrl: server.baseUrl, spec: interLabel, withDiagnostics: true, bundlePath: join(tmpdir(), 'reflection-no-such-bundle', 'bundle.json') });

    expectRejected(run, 'bundle-missing');
  }, 40_000);

  it('rejects an SVG with active content, even with a valid hash, and never fetches its URLs', async () => {
    const copy = await copyBundle('inter-label');
    const malicious = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="48.808047" height="16"><script>fetch('${server.baseUrl}/evil/script')</script><image xlink:href="${server.baseUrl}/evil/image.png" width="1" height="1"/><path d="M0 0" fill="url(${server.baseUrl}/evil/paint)" onload="fetch('${server.baseUrl}/evil/handler')"/></svg>`
    );
    await writeFile(join(copy.dir, 'source/label.svg'), malicious);
    const bundle = await copy.read();
    Object.assign(bundle.outlines[1], { bytes: malicious.length, sha256: sha(malicious) });
    await copy.write(bundle);
    server.requests.length = 0;

    const run = await runFixtureCase({ baseUrl: server.baseUrl, spec: interLabel, withDiagnostics: true, bundlePath: copy.bundlePath });

    expectRejected(run, 'svg-active-element');
    expect(recordOf(run).reasons.map((reason) => reason.code)).toEqual(expect.arrayContaining(['svg-event-handler', 'svg-external-reference']));
    expect(server.requests.filter((path) => path.startsWith('/evil/'))).toEqual([]);
  }, 40_000);

  it('reports live text in outlined source as unsupported instead of rendering or hiding it', async () => {
    const copy = await copyBundle('inter-label');
    const liveText = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="48.808047" height="16"><text x="0" y="12">Refresh</text></svg>');
    await writeFile(join(copy.dir, 'source/label.svg'), liveText);
    const bundle = await copy.read();
    Object.assign(bundle.outlines[1], { bytes: liveText.length, sha256: sha(liveText) });
    await copy.write(bundle);

    expectRejected(await runFixtureCase({ baseUrl: server.baseUrl, spec: interLabel, withDiagnostics: true, bundlePath: copy.bundlePath }), 'svg-live-text', 'unsupported');
  }, 40_000);
});

describe('isolation between cases', () => {
  it('keeps later cases byte-identical when an earlier case runs diagnostics, including a failing one', async () => {
    const standalone = await runFixtureCase({ baseUrl: server.baseUrl, spec: loraCaption });
    const standaloneSha = await fileSha(standalone, 'visual/lora-caption/actual.png');

    for (const failing of [false, true]) {
      const run = await runFixtureCase({
        baseUrl: server.baseUrl,
        spec: interLabel,
        withDiagnostics: true,
        caseOverrides: failing
          ? { textDiagnostics: { source: join(fixturesRoot, 'inter-label/bundle.json'), parts: [{ id: 'refresh-label', selector: '.does-not-exist' }], context: interLabel.context } }
          : {},
        extraCases: [createFixtureCase(loraCaption)]
      });
      const later = run.checks.find((check) => check.id === 'visual.lora-caption');

      expect(later?.status).toBe(standalone.check.status);
      expect(later?.metadata.diffPixels).toBe(standalone.check.metadata.diffPixels);
      expect(await fileSha(run, 'visual/lora-caption/actual.png')).toBe(standaloneSha);
      expect(later?.metadata.textDiagnostics).toBeUndefined();
    }
  }, 90_000);
});
