#!/usr/bin/env node
// Regenerates tests/fixtures/text-diagnostics. Dev-only: needs the devDependencies harfbuzzjs, wawoff2, @fontsource/* and sharp.
//
// Why these tools: HarfBuzz shapes the string (Chromium also uses HarfBuzz, so advances and kerning agree), the outlines are
// written as SVG paths, and the *reference raster* comes from librsvg (via sharp), not Chromium. That mirrors the real case
// of an independent design tool producing the reference while the browser rasterizes native text differently.
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputRoot = join(root, 'tests/fixtures/text-diagnostics');
const wawoff2 = require('wawoff2');
const hb = await import('harfbuzzjs');

const capturedAt = '2026-10-16T00:00:00.000Z';

const fixtures = [
  {
    id: 'inter-label',
    fontPackage: 'inter',
    fontFile: 'inter-latin-500-normal',
    family: 'Inter',
    weight: 500,
    text: 'Refresh',
    partId: 'refresh-label',
    size: 14,
    lineHeight: 16,
    trackingPercent: -3,
    frame: { width: 160, height: 64, deviceScaleFactor: 1 },
    button: { x: 20, y: 14, width: 120, height: 36, radius: 8 },
    colors: { background: '#0b1020', button: '#375dfb', label: '#ffffff' },
    source: {
      id: 'fixture:inter-label',
      scope: 'live-diagnostic',
      sourceVersion: null,
      document: { id: null, name: 'Fixture document A' },
      fileIdentity: { reportedId: null, attestedId: 'fixture-file-a', verification: 'caller-attested' },
      receipt: { id: 'receipt-inter-label', kind: 'caller-attestation' }
    },
    context: { theme: 'dark', adapter: 'fixture-html' }
  },
  {
    id: 'lora-caption',
    fontPackage: 'lora',
    fontFile: 'lora-latin-400-normal',
    family: 'Lora',
    weight: 400,
    text: 'Skicka åäö',
    partId: 'send-caption',
    size: 16,
    lineHeight: 24,
    trackingPercent: 0,
    frame: { width: 200, height: 72, deviceScaleFactor: 1 },
    button: { x: 16, y: 12, width: 168, height: 48, radius: 4 },
    colors: { background: '#f7f1e3', button: '#2b3a55', label: '#fbf8f1' },
    source: {
      id: 'fixture:lora-caption',
      scope: 'pinned',
      sourceVersion: 'fixture-2026-10-16',
      document: { id: 'fixture-doc-b', name: 'Fixture document B' },
      fileIdentity: { reportedId: 'fixture-file-b', attestedId: null, verification: 'reported' },
      receipt: { id: 'receipt-lora-caption', kind: 'export-receipt' }
    },
    context: { theme: 'paper' }
  }
];

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const num = (value) => String(Number(value.toFixed(6)));

function readTable(ttf, tag) {
  const view = new DataView(ttf.buffer, ttf.byteOffset, ttf.byteLength);
  const tableCount = view.getUint16(4);
  for (let index = 0; index < tableCount; index += 1) {
    const record = 12 + index * 16;
    const recordTag = String.fromCharCode(...ttf.subarray(record, record + 4));
    if (recordTag === tag) {
      return { offset: view.getUint32(record + 8), length: view.getUint32(record + 12), view };
    }
  }
  throw new Error(`Font has no ${tag} table`);
}

function readFontMetrics(ttf) {
  const hhea = readTable(ttf, 'hhea');
  return { ascender: hhea.view.getInt16(hhea.offset + 4), descender: hhea.view.getInt16(hhea.offset + 6) };
}

function readPostScriptName(ttf) {
  const name = readTable(ttf, 'name');
  const count = name.view.getUint16(name.offset + 2);
  const stringOffset = name.offset + name.view.getUint16(name.offset + 4);
  for (let index = 0; index < count; index += 1) {
    const record = name.offset + 6 + index * 12;
    if (name.view.getUint16(record + 6) !== 6) {
      continue;
    }
    const length = name.view.getUint16(record + 8);
    const start = stringOffset + name.view.getUint16(record + 10);
    const platform = name.view.getUint16(record);
    const raw = ttf.subarray(start, start + length);
    return platform === 3 || platform === 0 ? Buffer.from(raw).swap16().toString('utf16le') : Buffer.from(raw).toString('latin1');
  }
  throw new Error('Font has no PostScript name');
}

async function shape(fixture, ttf) {
  const blob = new hb.Blob(ttf.buffer.slice(ttf.byteOffset, ttf.byteOffset + ttf.byteLength));
  const face = new hb.Face(blob);
  const font = new hb.Font(face);
  const buffer = new hb.Buffer();
  buffer.addText(fixture.text);
  buffer.guessSegmentProperties();
  hb.shape(font, buffer);
  const infos = buffer.getGlyphInfos();
  const positions = buffer.getGlyphPositions();
  const scale = fixture.size / face.upem;
  const tracking = (fixture.trackingPercent / 100) * fixture.size;
  let pen = 0;
  const glyphs = infos.map((info, index) => {
    const position = positions[index];
    const glyph = { x: pen + position.xOffset * scale, path: font.glyphToPath(info.codepoint) };
    // CSS letter-spacing, like Figma tracking, adds space after every glyph including the last.
    pen += position.xAdvance * scale + tracking;
    return glyph;
  });
  return { glyphs, width: pen, scale };
}

function glyphMarkup(glyphs, scale) {
  return glyphs
    .filter((glyph) => glyph.path.length > 0)
    .map((glyph) => `<path transform="translate(${num(glyph.x)} 0) scale(${num(scale)} ${num(-scale)})" d="${glyph.path}"/>`)
    .join('');
}

function artifactFor(id, role, path, mediaType, bytes, extra = {}) {
  return { id, role, path, mediaType, bytes: bytes.length, sha256: sha256(bytes), ...extra };
}

async function generate(fixture) {
  const directory = join(outputRoot, fixture.id);
  rmSync(directory, { recursive: true, force: true });
  for (const sub of ['font', 'source', 'reference']) {
    mkdirSync(join(directory, sub), { recursive: true });
  }

  const packageRoot = join(root, 'node_modules/@fontsource', fixture.fontPackage);
  const woff2Bytes = readFileSync(join(packageRoot, 'files', `${fixture.fontFile}.woff2`));
  const ttf = Buffer.from(await wawoff2.decompress(woff2Bytes));
  const metrics = readFontMetrics(ttf);
  const postScriptName = readPostScriptName(ttf);
  const { glyphs, width: labelWidth, scale } = await shape(fixture, ttf);
  const upem = metrics.ascender - metrics.descender > 0 ? fixture.size / scale : 1;
  const ascent = (metrics.ascender / upem) * fixture.size;
  const descent = (-metrics.descender / upem) * fixture.size;

  const { frame, button } = fixture;
  const boxX = button.x + (button.width - labelWidth) / 2;
  const boxY = button.y + (button.height - fixture.lineHeight) / 2;
  // Half-leading splits the line-height surplus above and below the font's content area, as CSS inline layout does.
  const baselineOffset = (fixture.lineHeight - (ascent + descent)) / 2 + ascent;
  const baselineY = boxY + baselineOffset;

  const frameSvg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${frame.width}" height="${frame.height}" viewBox="0 0 ${frame.width} ${frame.height}">`,
    `<rect width="${frame.width}" height="${frame.height}" fill="${fixture.colors.background}"/>`,
    `<rect x="${button.x}" y="${button.y}" width="${button.width}" height="${button.height}" rx="${button.radius}" fill="${fixture.colors.button}"/>`,
    `<g fill="${fixture.colors.label}" transform="translate(${num(boxX)} ${num(baselineY)})">${glyphMarkup(glyphs, scale)}</g>`,
    '</svg>',
    ''
  ].join('\n');
  const labelWidthPx = Number(labelWidth.toFixed(6));
  const labelSvg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${num(labelWidth)}" height="${fixture.lineHeight}" viewBox="0 0 ${num(labelWidth)} ${fixture.lineHeight}">`,
    `<g fill="${fixture.colors.label}" transform="translate(0 ${num(baselineOffset)})">${glyphMarkup(glyphs, scale)}</g>`,
    '</svg>',
    ''
  ].join('\n');

  const referenceBytes = await sharp(Buffer.from(frameSvg), { density: 72 * frame.deviceScaleFactor })
    .webp({ lossless: true, exact: true, effort: 6 })
    .toBuffer();
  const referenceMeta = await sharp(referenceBytes).metadata();
  if (referenceMeta.width !== frame.width * frame.deviceScaleFactor || referenceMeta.height !== frame.height * frame.deviceScaleFactor) {
    throw new Error(`${fixture.id}: reference is ${referenceMeta.width}x${referenceMeta.height}`);
  }

  const fontFileName = `${fixture.fontFile}.woff`;
  copyFileSync(join(packageRoot, 'files', fontFileName), join(directory, 'font', fontFileName));
  copyFileSync(join(packageRoot, 'LICENSE'), join(directory, 'font', 'OFL.txt'));
  const frameBytes = Buffer.from(frameSvg);
  const labelBytes = Buffer.from(labelSvg);
  writeFileSync(join(directory, 'source/frame.svg'), frameBytes);
  writeFileSync(join(directory, 'source/label.svg'), labelBytes);
  writeFileSync(join(directory, 'reference/reference.webp'), referenceBytes);

  const bundle = {
    schema: 'reflection.text-source/v1',
    source: { ...fixture.source, capturedAt, exportSettings: { generator: 'scripts/generate-text-fixtures.mjs', outlinedText: true } },
    context: fixture.context,
    viewport: frame,
    reference: artifactFor('reference', 'reference', 'reference/reference.webp', 'image/webp', referenceBytes),
    outlines: [
      artifactFor('frame', 'outlined-source', 'source/frame.svg', 'image/svg+xml', frameBytes, {
        kind: 'frame',
        bounds: { x: 0, y: 0, width: frame.width, height: frame.height }
      }),
      artifactFor('label', 'outlined-source', 'source/label.svg', 'image/svg+xml', labelBytes, {
        kind: 'text-outline',
        bounds: { x: Number(boxX.toFixed(6)), y: Number(boxY.toFixed(6)), width: labelWidthPx, height: fixture.lineHeight },
        partIds: [fixture.partId]
      })
    ],
    parts: [
      {
        id: fixture.partId,
        expectedText: fixture.text,
        layerName: 'label',
        box: { x: Number(boxX.toFixed(6)), y: Number(boxY.toFixed(6)), width: labelWidthPx, height: fixture.lineHeight, basis: 'observed' },
        // The source tool does not report a baseline; this one is derived from font metrics and line height.
        baseline: { y: Number(baselineY.toFixed(6)), basis: 'inferred' },
        transform: null,
        typography: {
          family: fixture.family,
          postScriptName,
          size: fixture.size,
          weight: fixture.weight,
          tracking: { unit: 'percent', value: fixture.trackingPercent },
          lineHeight: { unit: 'px', value: fixture.lineHeight },
          direction: 'ltr',
          color: fixture.colors.label
        },
        fontAsset: { sha256: null, note: 'The authoring-font binary is not independently known.' }
      }
    ]
  };
  writeFileSync(join(directory, 'bundle.json'), `${JSON.stringify(bundle, null, 2)}\n`);
  console.log(`${fixture.id}: label ${labelWidthPx}px at (${bundle.parts[0].box.x}, ${bundle.parts[0].box.y}), baseline ${bundle.parts[0].baseline.y}, ${postScriptName}`);
}

mkdirSync(outputRoot, { recursive: true });
for (const fixture of fixtures) {
  await generate(fixture);
}
