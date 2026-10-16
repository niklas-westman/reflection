import type { TextSourcePart } from './bundle-schema.js';
import { firstCssFamily, judgePaintedFont, summarizeIdentity } from './font-identity.js';
import type { ExperimentRecord, FactBasis, Inference, NativeOutcome, Observation, PartRecord, PartRuntime } from './record.js';

export const geometryToleranceCssPx = 0.05;
export const typographyToleranceCssPx = 0.01;
// Chromium rounds a font's ascent and descent to whole pixels, so its baseline can sit up to half a pixel from an unrounded layout.
export const baselineToleranceCssPx = 0.5;
// The rendering-path experiment must beat the native screenshot by at least half before it is called a suspected cause.
export const renderingPathImprovementRatio = 0.5;

export interface PageFacts {
  fontFaces: Array<{ family: string; weight: string; style: string; stretch: string; status: string }>;
}

export function buildPartRecord(part: TextSourcePart, runtime: PartRuntime | null, page: PageFacts | null = null): PartRecord {
  const observations = runtime ? observePart(part, runtime, page) : [selectorObservation(part, 0)];
  return {
    id: part.id,
    expectedText: part.expectedText,
    runtime,
    observations,
    evidence: describeEvidence(part, runtime, observations)
  };
}

function selectorObservation(part: TextSourcePart, matchCount: number): Observation {
  return {
    field: 'selector.matchCount',
    source: 1,
    runtime: matchCount,
    delta: matchCount - 1,
    unit: 'elements',
    tolerance: 0,
    comparison: matchCount === 1 ? 'match' : 'mismatch',
    sourceBasis: 'provided',
    runtimeBasis: 'observed',
    note: `Text part ${part.id} must match exactly one element.`
  };
}

function observePart(part: TextSourcePart, runtime: PartRuntime, page: PageFacts | null): Observation[] {
  const observations: Observation[] = [selectorObservation(part, runtime.matchCount)];
  if (runtime.matchCount !== 1 || !runtime.typography || !runtime.geometry) {
    return observations;
  }

  const typography = runtime.typography;
  const source = part.typography;
  observations.push(textObservation(part, runtime));
  observations.push(fontIdentityObservation(part, runtime, page));
  observations.push(numericObservation('font.size', source.size, asNumber(typography.fontSize), 'css-px', typographyToleranceCssPx, 'provided', 'computed-style'));

  if (source.weight !== undefined) {
    observations.push(numericObservation('font.weight', source.weight, asNumber(typography.fontWeight), 'weight', 0, 'provided', 'computed-style'));
  }

  if (source.tracking) {
    const sourcePx = source.tracking.unit === 'px' ? source.tracking.value : (source.tracking.value / 100) * source.size;
    observations.push({
      ...numericObservation('letterSpacing', sourcePx, asNumber(typography.letterSpacingPx), 'css-px', typographyToleranceCssPx, 'provided', 'computed-style'),
      note: source.tracking.unit === 'percent' ? `Source tracking ${source.tracking.value}% of ${source.size}px converted to px.` : undefined
    });
  }

  if (source.lineHeight) {
    const sourcePx =
      source.lineHeight.unit === 'px'
        ? (source.lineHeight.value ?? null)
        : source.lineHeight.unit === 'percent' && source.lineHeight.value !== undefined
          ? (source.lineHeight.value / 100) * source.size
          : null;
    observations.push(numericObservation('lineHeight', sourcePx, asNumber(typography.lineHeightPx), 'css-px', typographyToleranceCssPx, 'provided', 'computed-style'));
  }

  if (source.color) {
    observations.push(colorObservation(source.color, String(typography.color)));
  }

  if (source.direction) {
    observations.push(equalityObservation('direction', source.direction, String(typography.direction), 'provided', 'computed-style'));
  }

  if (source.features && source.features.length > 0) {
    observations.push({
      field: 'features',
      source: source.features,
      runtime: typography.fontFeatureSettings,
      delta: null,
      unit: null,
      tolerance: null,
      comparison: 'unknown',
      sourceBasis: 'provided',
      runtimeBasis: 'computed-style',
      note: 'OpenType feature semantics are reported, not compared.'
    });
  }

  const element = runtime.geometry.elementBounds;
  for (const axis of ['x', 'y', 'width', 'height'] as const) {
    observations.push(numericObservation(`box.${axis}`, part.box[axis], element[axis], 'css-px', geometryToleranceCssPx, part.box.basis === 'observed' ? 'provided' : 'inferred', 'observed'));
  }

  observations.push(baselineObservation(part, runtime));
  observations.push(transformObservation(part, runtime));
  return observations;
}

function textObservation(part: TextSourcePart, runtime: PartRuntime): Observation {
  const actual = runtime.actualText ?? '';
  const normalizedEquivalent = actual.normalize('NFC') === part.expectedText.normalize('NFC');
  return {
    field: 'text',
    source: part.expectedText,
    runtime: actual,
    delta: null,
    unit: null,
    tolerance: null,
    comparison: actual === part.expectedText ? 'match' : 'mismatch',
    sourceBasis: 'provided',
    runtimeBasis: 'observed',
    ...(actual !== part.expectedText && normalizedEquivalent ? { note: 'Strings differ only by Unicode normalization form.' } : {})
  };
}

function fontIdentityObservation(part: TextSourcePart, runtime: PartRuntime, page: PageFacts | null): Observation {
  const source = part.typography;
  const used = runtime.platformFonts;
  const base = {
    field: 'font.identity',
    source: { family: source.family, style: source.style ?? null, postScriptName: source.postScriptName ?? null },
    delta: null,
    unit: null,
    tolerance: null,
    sourceBasis: 'provided' as FactBasis
  };
  if (!used || used.length === 0) {
    return { ...base, runtime: null, comparison: 'unknown', runtimeBasis: 'unavailable', note: 'The browser did not report which font painted the text; a requested family string does not prove it.' };
  }

  const context = { cssFirstFamily: firstCssFamily(runtime.typography?.fontFamily), loadedFaces: page?.fontFaces ?? [], sourceWeight: source.weight };
  const judgements = used.map((font) => judgePaintedFont(font, { family: source.family, style: source.style, postScriptName: source.postScriptName }, context));
  const summary = summarizeIdentity(judgements);
  return {
    ...base,
    runtime: used.map((font) => ({ familyName: font.familyName, postScriptName: font.postScriptName, isCustomFont: font.isCustomFont, glyphCount: font.glyphCount })),
    comparison: summary.comparison,
    runtimeBasis: 'cdp-platform-fonts',
    note: summary.note,
    classification: summary.classification,
    detail: { cssFirstFamily: context.cssFirstFamily, painted: judgements }
  };
}

function numericObservation(
  field: string,
  source: number | null,
  runtime: number | null,
  unit: string,
  tolerance: number,
  sourceBasis: FactBasis,
  runtimeBasis: FactBasis
): Observation {
  if (source === null || runtime === null) {
    return { field, source, runtime, delta: null, unit, tolerance, comparison: 'unknown', sourceBasis, runtimeBasis };
  }

  // Raw delta, never rounded: fractional placement is part of the evidence.
  const delta = runtime - source;
  return { field, source, runtime, delta, unit, tolerance, comparison: Math.abs(delta) <= tolerance ? 'match' : 'mismatch', sourceBasis, runtimeBasis };
}

function equalityObservation(field: string, source: string, runtime: string, sourceBasis: FactBasis, runtimeBasis: FactBasis): Observation {
  return { field, source, runtime, delta: null, unit: null, tolerance: null, comparison: source.toLowerCase() === runtime.toLowerCase() ? 'match' : 'mismatch', sourceBasis, runtimeBasis };
}

function colorObservation(sourceHex: string, runtimeCss: string): Observation {
  const runtime = parseCssColor(runtimeCss);
  const source = parseHexColor(sourceHex);
  const comparison = runtime && source ? (source.every((channel, index) => channel === runtime[index]) ? 'match' : 'mismatch') : 'unknown';
  return { field: 'color', source: sourceHex, runtime: runtimeCss, delta: null, unit: null, tolerance: 0, comparison, sourceBasis: 'provided', runtimeBasis: 'computed-style' };
}

function baselineObservation(part: TextSourcePart, runtime: PartRuntime): Observation {
  const observed = runtime.geometry?.baseline?.y ?? null;
  const provided = part.baseline?.y ?? null;
  return {
    ...numericObservation('baseline.y', provided, observed, 'css-px', baselineToleranceCssPx, part.baseline?.basis === 'observed' ? 'provided' : 'inferred', 'observed'),
    note: `Compared within ${baselineToleranceCssPx}px because the browser rounds font metrics to whole pixels; the raw delta is reported unrounded.${part.baseline?.basis === 'inferred' ? ' The source baseline is inferred, not reported by the source tool.' : ''}`
  };
}

function transformObservation(part: TextSourcePart, runtime: PartRuntime): Observation {
  const transforms = runtime.geometry?.transforms ?? [];
  if (part.transform !== null) {
    return { field: 'transform', source: part.transform, runtime: transforms, delta: null, unit: null, tolerance: null, comparison: 'unknown', sourceBasis: 'provided', runtimeBasis: 'computed-style', note: 'Transform chains are reported, not composed and compared.' };
  }

  return {
    field: 'transform',
    source: null,
    runtime: transforms,
    delta: null,
    unit: null,
    tolerance: null,
    comparison: transforms.length === 0 ? 'match' : 'mismatch',
    sourceBasis: 'provided',
    runtimeBasis: 'computed-style',
    note: transforms.length === 0 ? undefined : 'The source has no transform but the runtime element or an ancestor is transformed.'
  };
}

function describeEvidence(part: TextSourcePart, runtime: PartRuntime | null, observations: Observation[]): { complete: boolean; missing: string[] } {
  const missing: string[] = [];
  if (part.fontAsset.sha256 === null) missing.push('source.font-asset-checksum');
  if (!part.typography.postScriptName) missing.push('source.postscript-name');
  if (part.baseline === null) missing.push('source.baseline');
  else if (part.baseline.basis === 'inferred') missing.push('source.baseline-direct');
  if (!runtime || !runtime.platformFonts) missing.push('runtime.platform-fonts');
  else if (observations.find((observation) => observation.field === 'font.identity')?.comparison === 'unknown') missing.push('runtime.font-identity-unestablished');
  if (!runtime?.geometry?.baseline) missing.push('runtime.baseline');
  return { complete: missing.length === 0, missing };
}

export interface InferenceInput {
  native: NativeOutcome;
  parts: PartRecord[];
  experiments: ExperimentRecord[];
  source: { scope: 'pinned' | 'live-diagnostic'; sourceVersion: string | null };
}

export function inferCause(input: InferenceInput): Inference {
  const limitations = collectLimitations(input);

  if (input.parts.some((part) => part.runtime === null || part.runtime.matchCount !== 1)) {
    return { id: 'insufficient-evidence', confidence: 'none', summary: 'A declared text part did not match exactly one element, so no runtime evidence could be compared.', supportedBy: [], limitations };
  }

  const mismatches = input.parts.flatMap((part) => part.observations.filter((observation) => observation.comparison === 'mismatch').map((observation) => `${part.id}: ${observation.field}`));
  const fontMismatches = mismatches.filter((entry) => entry.endsWith('font.identity'));
  if (fontMismatches.length > 0) {
    return { id: 'font-identity-mismatch-observed', confidence: 'none', summary: 'The browser painted the text with a different font than the source names.', supportedBy: fontMismatches, limitations };
  }

  if (mismatches.length > 0) {
    return { id: 'typography-or-geometry-mismatch-observed', confidence: 'none', summary: 'Runtime typography or geometry differs from the independently supplied facts. A rendering-path explanation is withheld.', supportedBy: mismatches, limitations };
  }

  if (input.native.status === 'pass') {
    return { id: 'native-screenshot-passed', confidence: 'none', summary: 'The native screenshot passed; there is no discrepancy to explain.', supportedBy: [], limitations };
  }

  const best = bestMeasuredExperiment(input.experiments);
  if (!best?.measurement) {
    return { id: 'insufficient-evidence', confidence: 'none', summary: 'No rendering-path experiment produced a measurement.', supportedBy: [], limitations };
  }

  if (best.measurement.totalDiffPixels > input.native.diffPixels * renderingPathImprovementRatio) {
    return {
      id: 'insufficient-evidence',
      confidence: 'none',
      summary: 'The rendering-path experiment did not reduce the difference enough to point at the rendering path.',
      supportedBy: [`${best.id}: ${best.measurement.totalDiffPixels} differing pixels against ${input.native.diffPixels} for the native screenshot`],
      limitations
    };
  }

  const allEvidenceComplete = input.parts.every((part) => part.evidence.complete);
  const strong = allEvidenceComplete && input.source.scope === 'pinned' && input.source.sourceVersion !== null;
  return {
    id: 'native-text-vector-rendering-discrepancy-suspected',
    confidence: strong ? 'moderate' : 'low',
    summary: 'Typography and geometry agree within tolerance, and rendering the outlined source in the same browser differs far less from the reference than the native text does. Native text versus outlined-vector rendering is a suspected cause, not a proven one.',
    supportedBy: [
      `typography and geometry observations match within tolerance for ${input.parts.length} text part(s)`,
      `${best.id}: ${best.measurement.totalDiffPixels} differing pixels against ${input.native.diffPixels} for the native screenshot`
    ],
    limitations
  };
}

function bestMeasuredExperiment(experiments: ExperimentRecord[]): ExperimentRecord | undefined {
  return experiments
    .filter((experiment) => experiment.state === 'available' && experiment.measurement !== undefined)
    .sort((a, b) => (a.measurement?.totalDiffPixels ?? 0) - (b.measurement?.totalDiffPixels ?? 0))[0];
}

function collectLimitations(input: InferenceInput): string[] {
  const limitations = new Set<string>();
  if (input.source.sourceVersion === null) limitations.add('The authoring version of the source is not independently known.');
  if (input.source.scope === 'live-diagnostic') limitations.add('The source is a live diagnostic observation, not a pinned export.');
  for (const part of input.parts) {
    for (const missing of part.evidence.missing) {
      limitations.add(missingDescription(missing));
    }
  }
  limitations.add('Full-string shaping was not analysed.');
  return [...limitations];
}

function missingDescription(code: string): string {
  const descriptions: Record<string, string> = {
    'source.font-asset-checksum': 'The authoring-font checksum is unknown, so font-binary identity cannot be established.',
    'source.postscript-name': 'The source does not supply a PostScript name, so font identity is compared by family only.',
    'source.baseline': 'The source supplies no baseline.',
    'source.baseline-direct': 'The source baseline is inferred, not reported directly.',
    'runtime.platform-fonts': 'The browser did not report which font painted the text.',
    'runtime.font-identity-unestablished': 'Font names alone did not establish whether the painted font is the one the source names; the raw names are reported.',
    'runtime.baseline': 'The runtime baseline could not be measured.'
  };
  return descriptions[code] ?? code;
}

function asNumber(value: string | number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function parseHexColor(hex: string): [number, number, number, number] | undefined {
  const match = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(hex);
  if (!match) {
    return undefined;
  }
  const rgb = match[1] as string;
  return [Number.parseInt(rgb.slice(0, 2), 16), Number.parseInt(rgb.slice(2, 4), 16), Number.parseInt(rgb.slice(4, 6), 16), match[2] ? Number.parseInt(match[2], 16) : 255];
}

function parseCssColor(css: string): [number, number, number, number] | undefined {
  const match = /^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?\s*\)$/.exec(css.trim());
  if (!match) {
    return undefined;
  }
  const alpha = match[4] === undefined ? 255 : Math.round(Number(match[4]) * 255);
  return [Number(match[1]), Number(match[2]), Number(match[3]), alpha];
}
