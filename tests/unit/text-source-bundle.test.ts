import { createHash } from 'node:crypto';
import { cp, mkdtemp, readFile, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { loadTextSource, TextDiagnosticsInputError } from '../../src/diagnostics/text/bundle-loader.js';

const fixturesRoot = join(process.cwd(), 'tests/fixtures/text-diagnostics');

type Bundle = Record<string, any>;

async function copyFixture(id = 'inter-label'): Promise<{ dir: string; bundlePath: string; read(): Promise<Bundle>; write(bundle: Bundle): Promise<void> }> {
  const dir = await mkdtemp(join(tmpdir(), 'reflection-text-bundle-'));
  await cp(join(fixturesRoot, id), dir, { recursive: true });
  const bundlePath = join(dir, 'bundle.json');
  return {
    dir,
    bundlePath,
    read: async () => JSON.parse(await readFile(bundlePath, 'utf8')) as Bundle,
    write: (bundle) => writeFile(bundlePath, `${JSON.stringify(bundle, null, 2)}\n`)
  };
}

function sha(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

async function rejection(promise: Promise<unknown>): Promise<TextDiagnosticsInputError> {
  const error = await promise.then(
    () => undefined,
    (caught: unknown) => caught
  );
  expect(error).toBeInstanceOf(TextDiagnosticsInputError);
  return error as TextDiagnosticsInputError;
}

function codes(error: TextDiagnosticsInputError): string[] {
  return error.reasons.map((reason) => reason.code);
}

describe('loadTextSource', () => {
  it.each(['inter-label', 'lora-caption'])('loads the committed %s fixture offline', async (id) => {
    const loaded = await loadTextSource(join(fixturesRoot, id, 'bundle.json'));

    expect(loaded.bundle.schema).toBe('reflection.text-source/v1');
    expect(loaded.reference.format).toBe('webp-lossless');
    expect(loaded.outlines.map((outline) => outline.artifact.kind).sort()).toEqual(['frame', 'text-outline']);
    expect(loaded.bundleSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('keeps fractional source coordinates exactly as supplied', async () => {
    const loaded = await loadTextSource(join(fixturesRoot, 'inter-label', 'bundle.json'));
    const part = loaded.bundle.parts[0];

    expect(part?.box.x).toBe(55.595977);
    expect(part?.baseline).toEqual({ y: 37.092773, basis: 'inferred' });
  });

  it('keeps a null reported file id null next to a caller attestation', async () => {
    const loaded = await loadTextSource(join(fixturesRoot, 'inter-label', 'bundle.json'));

    expect(loaded.bundle.source.fileIdentity).toEqual({ reportedId: null, attestedId: 'fixture-file-a', verification: 'caller-attested' });
    expect(loaded.bundle.source.sourceVersion).toBeNull();
  });

  it('rejects a tampered outlined SVG by hash', async () => {
    const fixture = await copyFixture();
    const path = join(fixture.dir, 'source/label.svg');
    const original = await readFile(path, 'utf8');
    await writeFile(path, original.replace('translate(0 ', 'translate(1 '));

    const error = await rejection(loadTextSource(fixture.bundlePath));

    expect(error.state).toBe('invalid');
    expect(codes(error)).toEqual(['artifact-hash-mismatch']);
  });

  it('rejects a tampered reference image by hash', async () => {
    const fixture = await copyFixture();
    const path = join(fixture.dir, 'reference/reference.webp');
    const bytes = await readFile(path);
    bytes[bytes.length - 1] = (bytes[bytes.length - 1] ?? 0) ^ 0xff;
    await writeFile(path, bytes);

    expect(codes(await rejection(loadTextSource(fixture.bundlePath)))).toEqual(['artifact-hash-mismatch']);
  });

  it('rejects a changed size even before hashing matters', async () => {
    const fixture = await copyFixture();
    const bundle = await fixture.read();
    bundle.outlines[0].bytes += 1;
    await fixture.write(bundle);

    expect(codes(await rejection(loadTextSource(fixture.bundlePath)))).toEqual(['artifact-size-mismatch']);
  });

  it('rejects a missing artifact file', async () => {
    const fixture = await copyFixture();
    const bundle = await fixture.read();
    bundle.outlines[0].path = 'source/absent.svg';
    await fixture.write(bundle);

    expect(codes(await rejection(loadTextSource(fixture.bundlePath)))).toEqual(['artifact-missing']);
  });

  it.each(['../outside.svg', '/etc/hosts', 'source/../../x.svg', 'C:\\x.svg', 'source\\x.svg'])('rejects the unsafe artifact path %s in the schema', async (unsafe) => {
    const fixture = await copyFixture();
    const bundle = await fixture.read();
    bundle.outlines[0].path = unsafe;
    await fixture.write(bundle);

    const error = await rejection(loadTextSource(fixture.bundlePath));

    expect(codes(error)).toEqual(['bundle-schema']);
    expect(error.reasons[0]?.message).toContain('relative path inside the bundle directory');
  });

  it('rejects a symlink that escapes the bundle directory', async () => {
    const fixture = await copyFixture();
    const outside = await mkdtemp(join(tmpdir(), 'reflection-text-outside-'));
    const outsideSvg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="48.808047" height="16"/>');
    await writeFile(join(outside, 'label.svg'), outsideSvg);
    await symlink(join(outside, 'label.svg'), join(fixture.dir, 'source/linked.svg'));
    const bundle = await fixture.read();
    Object.assign(bundle.outlines[1], { path: 'source/linked.svg', bytes: outsideSvg.length, sha256: sha(outsideSvg) });
    await fixture.write(bundle);

    expect(codes(await rejection(loadTextSource(fixture.bundlePath)))).toEqual(['artifact-outside-bundle']);
  });

  it('rejects unknown keys anywhere in the bundle', async () => {
    const fixture = await copyFixture();
    const bundle = await fixture.read();
    bundle.parts[0].typography.fontSizee = 14;
    await fixture.write(bundle);

    const error = await rejection(loadTextSource(fixture.bundlePath));

    expect(codes(error)).toEqual(['bundle-schema']);
    expect(error.reasons[0]?.message).toContain('fontSizee');
  });

  it('rejects malformed JSON and a wrong schema id', async () => {
    const fixture = await copyFixture();
    await writeFile(fixture.bundlePath, '{ not json');
    expect(codes(await rejection(loadTextSource(fixture.bundlePath)))).toEqual(['bundle-malformed']);

    const bundle = JSON.parse(await readFile(join(fixturesRoot, 'inter-label', 'bundle.json'), 'utf8')) as Bundle;
    bundle.schema = 'reflection.text-source/v2';
    await fixture.write(bundle);
    expect(codes(await rejection(loadTextSource(fixture.bundlePath)))).toEqual(['bundle-schema']);
  });

  it('never lets an attested id stand in for a missing reported id', async () => {
    const fixture = await copyFixture();
    const bundle = await fixture.read();
    bundle.source.fileIdentity = { reportedId: null, attestedId: 'fixture-file-a', verification: 'reported' };
    await fixture.write(bundle);

    const error = await rejection(loadTextSource(fixture.bundlePath));

    expect(error.reasons[0]?.message).toContain('an attested id never replaces a null reported id');
  });

  it('rejects inconsistent identity verification', async () => {
    const fixture = await copyFixture();
    const bundle = await fixture.read();
    bundle.source.fileIdentity = { reportedId: null, attestedId: null, verification: 'caller-attested' };
    await fixture.write(bundle);
    expect((await rejection(loadTextSource(fixture.bundlePath))).reasons[0]?.message).toContain('requires an attestedId');

    bundle.source.fileIdentity = { reportedId: 'x', attestedId: null, verification: 'unknown' };
    await fixture.write(bundle);
    expect((await rejection(loadTextSource(fixture.bundlePath))).reasons[0]?.message).toContain('cannot carry an id');
  });

  it('rejects duplicate ids and unknown part references', async () => {
    const fixture = await copyFixture();
    const bundle = await fixture.read();
    bundle.outlines[1].id = 'frame';
    await fixture.write(bundle);
    expect((await rejection(loadTextSource(fixture.bundlePath))).reasons.map((reason) => reason.message).join(' ')).toContain('duplicate artifact id "frame"');

    const second = await fixture.read();
    second.outlines[1].id = 'label';
    second.outlines[1].partIds = ['nope'];
    await fixture.write(second);
    expect((await rejection(loadTextSource(fixture.bundlePath))).reasons.map((reason) => reason.message).join(' ')).toContain('unknown part id "nope"');
  });

  it('rejects a reference whose pixel size contradicts the viewport and device scale', async () => {
    const fixture = await copyFixture();
    const bundle = await fixture.read();
    bundle.viewport.deviceScaleFactor = 2;
    await fixture.write(bundle);

    expect(codes(await rejection(loadTextSource(fixture.bundlePath)))).toEqual(['reference-dimension-mismatch']);
  });

  it('rejects a reference whose format contradicts its media type', async () => {
    const fixture = await copyFixture();
    const png = await sharp(join(fixture.dir, 'reference/reference.webp')).png().toBuffer();
    await writeFile(join(fixture.dir, 'reference/reference.webp'), png);
    const bundle = await fixture.read();
    Object.assign(bundle.reference, { bytes: png.length, sha256: sha(png) });
    await fixture.write(bundle);

    expect(codes(await rejection(loadTextSource(fixture.bundlePath)))).toEqual(['reference-format-mismatch']);
  });

  it('rejects outline bounds that contradict the SVG or the viewport', async () => {
    const fixture = await copyFixture();
    const bundle = await fixture.read();
    bundle.outlines[1].bounds.width += 5;
    await fixture.write(bundle);
    expect(codes(await rejection(loadTextSource(fixture.bundlePath)))).toEqual(['outline-bounds-mismatch']);

    const second = await fixture.read();
    second.outlines[1].bounds.width -= 5;
    second.outlines[0].bounds.x = 3;
    await fixture.write(second);
    expect(codes(await rejection(loadTextSource(fixture.bundlePath)))).toEqual(['frame-bounds-mismatch']);
  });

  it('classifies live text in an outline as unsupported, and active content as invalid', async () => {
    const fixture = await copyFixture();
    const bundle = await fixture.read();
    const liveText = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="48.808047" height="16"><text>Refresh</text></svg>');
    await writeFile(join(fixture.dir, 'source/label.svg'), liveText);
    Object.assign(bundle.outlines[1], { bytes: liveText.length, sha256: sha(liveText) });
    await fixture.write(bundle);
    const unsupported = await rejection(loadTextSource(fixture.bundlePath));
    expect(unsupported.state).toBe('unsupported');
    expect(codes(unsupported)).toEqual(['svg-live-text']);

    const active = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="48.808047" height="16"><script>alert(1)</script></svg>');
    await writeFile(join(fixture.dir, 'source/label.svg'), active);
    Object.assign(bundle.outlines[1], { bytes: active.length, sha256: sha(active) });
    await fixture.write(bundle);
    const invalid = await rejection(loadTextSource(fixture.bundlePath));
    expect(invalid.state).toBe('invalid');
    expect(codes(invalid)).toEqual(['svg-active-element']);
  });

  it('enforces size limits before reading large files', async () => {
    const fixture = await copyFixture();

    const error = await rejection(loadTextSource(fixture.bundlePath, { maxBundleBytes: 10, maxReferenceBytes: 1, maxSvgBytes: 1, maxTotalSvgBytes: 1 }));

    expect(codes(error)).toEqual(['bundle-too-large']);
    const second = await rejection(loadTextSource(fixture.bundlePath, { maxBundleBytes: 1_000_000, maxReferenceBytes: 100, maxSvgBytes: 1_000_000, maxTotalSvgBytes: 1_000_000 }));
    expect(codes(second)).toEqual(['artifact-too-large']);
  });
});
