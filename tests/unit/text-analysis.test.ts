import { describe, expect, it } from 'vitest';
import { buildPartRecord, inferCause } from '../../src/diagnostics/text/analysis.js';
import type { TextSourcePart } from '../../src/diagnostics/text/bundle-schema.js';
import type { ExperimentRecord, NativeOutcome, PartRuntime } from '../../src/diagnostics/text/record.js';

function sourcePart(overrides: Partial<TextSourcePart> = {}): TextSourcePart {
  return {
    id: 'label',
    expectedText: 'Refresh',
    box: { x: 55.595977, y: 24, width: 48.808047, height: 16, basis: 'observed' },
    baseline: { y: 37.092773, basis: 'inferred' },
    transform: null,
    typography: {
      family: 'Inter',
      postScriptName: 'Inter-Medium',
      size: 14,
      weight: 500,
      tracking: { unit: 'percent', value: -3 },
      lineHeight: { unit: 'px', value: 16 },
      direction: 'ltr',
      color: '#ffffff'
    },
    fontAsset: { sha256: null },
    ...overrides
  };
}

function runtime(overrides: Partial<PartRuntime> = {}): PartRuntime {
  return {
    selector: '.label',
    matchCount: 1,
    actualText: 'Refresh',
    element: { tagName: 'span', role: null, ariaLabel: null, ariaSnapshot: null },
    typography: { fontSize: 14, fontWeight: 500, letterSpacingPx: -0.42, lineHeightPx: 16, direction: 'ltr', color: 'rgb(255, 255, 255)', fontFeatureSettings: 'normal' },
    geometry: {
      elementBounds: { x: 55.59375, y: 24, width: 48.8125, height: 16 },
      textBounds: null,
      baseline: { y: 37, method: 'inline-block-probe', basis: 'observed' },
      transforms: []
    },
    platformFonts: [{ familyName: 'Inter Medium', postScriptName: 'Inter-Medium', isCustomFont: true, glyphCount: 7 }],
    platformFontsMethod: 'CSS.getPlatformFontsForNode',
    ...overrides
  };
}

function typography(overrides: Record<string, string | number | null>): PartRuntime['typography'] {
  return { ...(runtime().typography as Record<string, string | number | null>), ...overrides };
}

function observation(part: ReturnType<typeof buildPartRecord>, field: string) {
  const found = part.observations.find((candidate) => candidate.field === field);
  expect(found, `observation ${field}`).toBeDefined();
  return found as NonNullable<typeof found>;
}

const failedNative: NativeOutcome = { status: 'fail', classification: 'visual-diff', diffPixels: 76, diffRatio: 0.0074, threshold: { maxDiffPixels: 0 }, unchanged: true };

function experiment(totalDiffPixels: number): ExperimentRecord {
  return {
    id: 'frame-render',
    kind: 'frame-render',
    state: 'available',
    description: 'x',
    measurement: { totalDiffPixels, regionDiffPixels: totalDiffPixels, outsideRegionDiffPixels: 0, totalPixels: 10240, regionPixels: 1080, region: { x: 0, y: 0, width: 1, height: 1 }, regionUnit: 'device-pixels' }
  };
}

describe('buildPartRecord', () => {
  it('matches a faithful implementation and keeps raw fractional deltas', () => {
    const part = buildPartRecord(sourcePart(), runtime());

    expect(part.observations.map((entry) => entry.comparison).filter((comparison) => comparison === 'mismatch')).toEqual([]);
    expect(observation(part, 'box.x').delta).toBe(55.59375 - 55.595977);
    expect(observation(part, 'box.x').comparison).toBe('match');
    expect(observation(part, 'baseline.y').delta).toBe(37 - 37.092773);
    expect(observation(part, 'baseline.y').sourceBasis).toBe('inferred');
    expect(observation(part, 'letterSpacing').source).toBeCloseTo(-0.42, 10);
    expect(observation(part, 'letterSpacing').note).toContain('-3% of 14px');
  });

  it.each([
    ['font size', typography({ fontSize: 15 }), 'font.size'],
    ['font weight', typography({ fontWeight: 700 }), 'font.weight'],
    ['tracking', typography({ letterSpacingPx: 0 }), 'letterSpacing'],
    ['line height', typography({ lineHeightPx: 20 }), 'lineHeight'],
    ['color', typography({ color: 'rgb(255, 0, 0)' }), 'color'],
    ['direction', typography({ direction: 'rtl' }), 'direction']
  ])('keeps a wrong %s visible as a mismatch', (_label, changed, field) => {
    expect(observation(buildPartRecord(sourcePart(), runtime({ typography: changed })), field).comparison).toBe('mismatch');
  });

  it('keeps wrong text visible, noting when only the Unicode form differs', () => {
    expect(observation(buildPartRecord(sourcePart(), runtime({ actualText: 'Reload' })), 'text').comparison).toBe('mismatch');

    const composed = buildPartRecord(sourcePart({ expectedText: 'å' }), runtime({ actualText: 'å' }));
    expect(observation(composed, 'text')).toMatchObject({ comparison: 'mismatch', note: 'Strings differ only by Unicode normalization form.' });
  });

  it('keeps a shifted box or baseline visible', () => {
    const shifted = runtime({
      geometry: { elementBounds: { x: 58.59375, y: 26, width: 48.8125, height: 16 }, textBounds: null, baseline: { y: 39, method: 'inline-block-probe', basis: 'observed' }, transforms: [] }
    });
    const part = buildPartRecord(sourcePart(), shifted);

    expect(observation(part, 'box.x')).toMatchObject({ comparison: 'mismatch', delta: 58.59375 - 55.595977 });
    expect(observation(part, 'box.y').comparison).toBe('mismatch');
    expect(observation(part, 'baseline.y').comparison).toBe('mismatch');
  });

  it('allows sub-pixel baseline rounding but not a whole-pixel baseline defect', () => {
    const halfPixel = runtime({ geometry: { ...(runtime().geometry as NonNullable<PartRuntime['geometry']>), baseline: { y: 37.5, method: 'inline-block-probe', basis: 'observed' } } });
    expect(observation(buildPartRecord(sourcePart(), halfPixel), 'baseline.y').comparison).toBe('match');

    const wholePixel = runtime({ geometry: { ...(runtime().geometry as NonNullable<PartRuntime['geometry']>), baseline: { y: 38.2, method: 'inline-block-probe', basis: 'observed' } } });
    expect(observation(buildPartRecord(sourcePart(), wholePixel), 'baseline.y').comparison).toBe('mismatch');
  });

  it('flags a transformed runtime element when the source has none', () => {
    const transformed = runtime({ geometry: { ...(runtime().geometry as NonNullable<PartRuntime['geometry']>), transforms: [{ element: 'span', matrix: 'matrix(1, 0, 0, 1, 3, 0)' }] } });

    expect(observation(buildPartRecord(sourcePart(), transformed), 'transform').comparison).toBe('mismatch');
  });

  describe('font identity', () => {
    it('decides by PostScript name when both sides have one', () => {
      expect(observation(buildPartRecord(sourcePart(), runtime()), 'font.identity').comparison).toBe('match');

      const other = runtime({ platformFonts: [{ familyName: 'Inter', postScriptName: 'Inter-Bold', isCustomFont: true, glyphCount: 7 }] });
      expect(observation(buildPartRecord(sourcePart(), other), 'font.identity').comparison).toBe('mismatch');
    });

    it('compares by family when no PostScript name exists, and flags a fallback', () => {
      const withoutPostScript = sourcePart({ typography: { ...sourcePart().typography, postScriptName: undefined } });
      const fallback = runtime({ platformFonts: [{ familyName: 'Helvetica', postScriptName: null, isCustomFont: false, glyphCount: 7 }] });
      const mismatch = observation(buildPartRecord(withoutPostScript, fallback), 'font.identity');

      expect(mismatch.comparison).toBe('mismatch');
      expect(mismatch.note).toContain('fallback or substitution suspected');
    });

    it('flags a partial fallback when only some glyphs use another font', () => {
      const partial = runtime({
        platformFonts: [
          { familyName: 'Inter Medium', postScriptName: 'Inter-Medium', isCustomFont: true, glyphCount: 6 },
          { familyName: 'Apple Color Emoji', postScriptName: 'AppleColorEmoji', isCustomFont: false, glyphCount: 1 }
        ]
      });

      expect(observation(buildPartRecord(sourcePart(), partial), 'font.identity').comparison).toBe('mismatch');
    });

    it('stays unknown, never a match, when the browser does not report the painted font', () => {
      const unknown = observation(buildPartRecord(sourcePart(), runtime({ platformFonts: null, platformFontsMethod: 'unavailable' })), 'font.identity');

      expect(unknown.comparison).toBe('unknown');
      expect(unknown.runtimeBasis).toBe('unavailable');
    });
  });

  describe('evidence completeness', () => {
    it('lists what is missing instead of assuming it', () => {
      const part = buildPartRecord(sourcePart(), runtime());

      expect(part.evidence).toEqual({ complete: false, missing: ['source.font-asset-checksum', 'source.baseline-direct'] });
    });

    it('is complete only with a checksum, PostScript name, observed baseline and runtime facts', () => {
      const complete = buildPartRecord(
        sourcePart({ fontAsset: { sha256: 'a'.repeat(64) }, baseline: { y: 37, basis: 'observed' } }),
        runtime()
      );

      expect(complete.evidence).toEqual({ complete: true, missing: [] });
    });

    it('reports a part that did not match exactly one element', () => {
      const part = buildPartRecord(sourcePart(), runtime({ matchCount: 2, typography: null, geometry: null, platformFonts: null }));

      expect(part.observations).toHaveLength(1);
      expect(observation(part, 'selector.matchCount')).toMatchObject({ comparison: 'mismatch', runtime: 2 });
    });
  });
});

describe('inferCause', () => {
  const liveSource = { scope: 'live-diagnostic' as const, sourceVersion: null };

  it('suspects the rendering path only when observations match and the experiment clearly beats the native screenshot', () => {
    const inference = inferCause({ native: failedNative, parts: [buildPartRecord(sourcePart(), runtime())], experiments: [experiment(0)], source: liveSource });

    expect(inference).toMatchObject({ id: 'native-text-vector-rendering-discrepancy-suspected', confidence: 'low' });
    expect(inference.limitations).toEqual(
      expect.arrayContaining([
        'The authoring version of the source is not independently known.',
        'The source is a live diagnostic observation, not a pinned export.',
        'The authoring-font checksum is unknown, so font-binary identity cannot be established.',
        'Full-string shaping was not analysed.'
      ])
    );
  });

  it('reaches moderate confidence only with pinned, versioned, complete evidence', () => {
    const complete = buildPartRecord(sourcePart({ fontAsset: { sha256: 'a'.repeat(64) }, baseline: { y: 37, basis: 'observed' } }), runtime());

    expect(inferCause({ native: failedNative, parts: [complete], experiments: [experiment(0)], source: { scope: 'pinned', sourceVersion: '2026-10-14' } }).confidence).toBe('moderate');
    expect(inferCause({ native: failedNative, parts: [complete], experiments: [experiment(0)], source: { scope: 'pinned', sourceVersion: null } }).confidence).toBe('low');
    expect(inferCause({ native: failedNative, parts: [complete], experiments: [experiment(0)], source: { scope: 'live-diagnostic', sourceVersion: 'v1' } }).confidence).toBe('low');
  });

  it.each([
    ['text', runtime({ actualText: 'Reload' })],
    ['font size', runtime({ typography: typography({ fontSize: 16 }) })],
    ['a materially shifted string', runtime({ geometry: { ...(runtime().geometry as NonNullable<PartRuntime['geometry']>), elementBounds: { x: 61.6, y: 24, width: 48.8, height: 16 } } })]
  ])('withholds the rendering-path claim when %s differs, however good the experiment looks', (_label, changed) => {
    const inference = inferCause({ native: failedNative, parts: [buildPartRecord(sourcePart(), changed)], experiments: [experiment(0)], source: liveSource });

    expect(inference.id).toBe('typography-or-geometry-mismatch-observed');
    expect(inference.supportedBy.length).toBeGreaterThan(0);
  });

  it('reports a font identity mismatch ahead of other mismatches', () => {
    const fallback = runtime({ typography: typography({ fontSize: 16 }), platformFonts: [{ familyName: 'Helvetica', postScriptName: null, isCustomFont: false, glyphCount: 7 }] });

    expect(inferCause({ native: failedNative, parts: [buildPartRecord(sourcePart(), fallback)], experiments: [experiment(0)], source: liveSource }).id).toBe('font-identity-mismatch-observed');
  });

  it('claims nothing when the native screenshot passed', () => {
    const inference = inferCause({ native: { ...failedNative, status: 'pass', diffPixels: 0 }, parts: [buildPartRecord(sourcePart(), runtime())], experiments: [experiment(0)], source: liveSource });

    expect(inference).toMatchObject({ id: 'native-screenshot-passed', confidence: 'none' });
  });

  it('needs the experiment to beat the native difference by half', () => {
    const modest = inferCause({ native: failedNative, parts: [buildPartRecord(sourcePart(), runtime())], experiments: [experiment(50)], source: liveSource });

    expect(modest.id).toBe('insufficient-evidence');
    expect(modest.supportedBy[0]).toContain('50 differing pixels against 76');
  });

  it('is insufficient without a measured experiment or when a selector did not match one element', () => {
    expect(inferCause({ native: failedNative, parts: [buildPartRecord(sourcePart(), runtime())], experiments: [], source: liveSource }).id).toBe('insufficient-evidence');

    const missing = buildPartRecord(sourcePart(), runtime({ matchCount: 0, typography: null, geometry: null, platformFonts: null }));
    expect(inferCause({ native: failedNative, parts: [missing], experiments: [experiment(0)], source: liveSource }).id).toBe('insufficient-evidence');
  });

  it('ignores experiments that errored or were skipped', () => {
    const errored: ExperimentRecord = { id: 'frame-render', kind: 'frame-render', state: 'error', description: 'x', reason: 'boom' };

    expect(inferCause({ native: failedNative, parts: [buildPartRecord(sourcePart(), runtime())], experiments: [errored], source: liveSource }).id).toBe('insufficient-evidence');
  });
});
