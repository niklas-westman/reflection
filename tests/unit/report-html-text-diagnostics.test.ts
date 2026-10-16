import { describe, expect, it } from 'vitest';
import { renderHtmlReport } from '../../src/core/report-html.js';
import { createReport, type CheckResult } from '../../src/core/report-schema.js';

function recordFixture(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schema: 'reflection.text-diagnostics/v1',
    state: 'available',
    statement: 'Diagnostic only. This record does not change the native screenshot outcome, grant compliance, or stand in for owner approval.',
    runId: 'run-1',
    caseId: 'button-refresh',
    reasons: [],
    nativeOutcome: { status: 'fail', classification: 'visual-diff', diffPixels: 86, diffRatio: 0.0084, threshold: { maxDiffPixels: 60 }, unchanged: true },
    source: { id: 's', scope: 'live-diagnostic', sourceVersion: null, fileIdentity: { reportedId: null, attestedId: 'k', verification: 'caller-attested' } },
    inputs: { bindingKey: 'a'.repeat(64) },
    parts: [
      {
        id: 'label',
        observations: [
          { field: 'font.size', source: 14, runtime: 14, delta: 0, tolerance: 0.01, comparison: 'match', sourceBasis: 'provided', runtimeBasis: 'computed-style' },
          { field: 'font.identity', source: { family: 'Instrument Sans', style: 'Medium', postScriptName: null }, runtime: [{ familyName: 'Instrument Sans Medium' }], delta: null, tolerance: null, comparison: 'match', classification: 'style-qualified-family-alias', sourceBasis: 'provided', runtimeBasis: 'cdp-platform-fonts' },
          { field: 'baseline.y', source: 115.00003, runtime: 115, delta: -0.00003, tolerance: 0.5, comparison: 'match', sourceBasis: 'inferred', runtimeBasis: 'observed' }
        ]
      }
    ],
    experiments: [
      { id: 'frame-render', state: 'available', measurement: { totalDiffPixels: 15, regionDiffPixels: 15 }, nativeMeasurement: { regionDiffPixels: 86 } },
      { id: 'part-overlay:label', state: 'skipped', reason: 'selector-not-found' }
    ],
    inference: { id: 'native-text-vector-rendering-discrepancy-suspected', confidence: 'low', summary: 'Suspected, not proven.', supportedBy: ['a'], limitations: ['The authoring version of the source is not independently known.'] },
    artifacts: [
      { role: 'reference-image', path: 'visual/c/expected.png' },
      { role: 'implementation-screenshot', path: 'visual/c/actual.png' },
      { role: 'diagnostic-render', path: 'visual/c/text-diagnostics/frame-render.png' },
      { role: 'source-outline', path: 'visual/c/text-diagnostics/source-frame.svg' }
    ],
    shaping: { state: 'unsupported', reason: 'Full-string shaping is not part of this release.' },
    ...overrides
  };
}

function render(record: unknown, artifactPaths: string[] = ['visual/c/expected.png', 'visual/c/actual.png', 'visual/c/text-diagnostics/frame-render.png', 'visual/c/text-diagnostics/source-frame.svg']): string {
  const check: CheckResult = {
    id: 'visual.button-refresh',
    suite: 'visual',
    target: 'button refresh',
    status: 'fail',
    severity: 'blocking',
    summary: 'Differs.',
    artifacts: artifactPaths.map((path) => ({ type: 'image', role: 'evidence', path })),
    metadata: { textDiagnostics: record }
  };
  return renderHtmlReport(createReport({ runId: 'run-1', project: 'p', startedAt: new Date('2026-10-16T10:00:00Z'), finishedAt: new Date('2026-10-16T10:00:01Z'), mode: 'visual', ci: false, checks: [check] }));
}

// Only the rendered panel: class names also appear in the stylesheet and paths in the report's embedded JSON.
function panel(html: string): string {
  const start = html.indexOf('<section class="text-diagnostics"');
  return start === -1 ? '' : html.slice(start, html.indexOf('</section>', start));
}

describe('text diagnostics in the HTML report', () => {
  it('shows a separate diagnostic panel that keeps the native result and the limits visible', () => {
    const html = panel(render(recordFixture()));

    expect(html).toContain('Text diagnostics');
    expect(html).toContain('diagnostic only');
    expect(html).toContain('live, unversioned source');
    expect(html).toContain('source version unknown');
    expect(html).toContain('identity: caller-attested');
    expect(html).toContain('Native screenshot result (unchanged):</strong> fail · 86 differing pixels (0.84%)');
    expect(html).toContain('native-text-vector-rendering-discrepancy-suspected');
    expect(html).toContain('The authoring version of the source is not independently known.');
    expect(html).toContain('Rendering-path experiments (diagnostic renders, not implementation evidence)');
    expect(html).toContain('part-overlay:label');
    expect(html).toContain('selector-not-found');
    expect(html).toContain('Diagnostic render (not implementation evidence)');
    expect(html).toContain('Full-string shaping is not part of this release.');
    expect(html).toContain('a'.repeat(64));
  });

  it('marks inferred measurements and highlights mismatches', () => {
    const html = panel(render(recordFixture()));

    expect(html).toContain('<small>inferred</small>');
    expect(html).toContain('<small>style-qualified-family-alias</small>');
    expect(html).toContain('<small>provided</small>');
    expect(html).not.toContain('Approve');
    expect(html).not.toContain('Promote');
  });

  it('shows only the reasons for rejected input, with no images or measurements', () => {
    const html = panel(render(recordFixture({ state: 'invalid', reasons: [{ code: 'artifact-hash-mismatch', message: 'Tampered.' }], artifacts: [], parts: [], experiments: [], inference: null, inputs: null })));

    expect(html).toContain('artifact-hash-mismatch');
    expect(html).toContain('Tampered.');
    expect(html).not.toContain('text-diagnostics__images');
    expect(html).not.toContain('Rendering-path experiments');
  });

  it('escapes every field and ignores artifact paths that are not attached to the check', () => {
    const hostile = recordFixture({
      statement: '<img src=x onerror=alert(1)>',
      inference: { id: '<script>alert(2)</script>', confidence: '"x"', summary: '<b>s</b>', supportedBy: ['<i>'], limitations: [] },
      artifacts: [
        { role: 'diagnostic-render', path: '../../etc/passwd.png' },
        { role: 'diagnostic-render', path: 'https://evil.test/x.png' },
        { role: 'diagnostic-render', path: 'visual/c/not-attached.png' },
        { role: 'diagnostic-render', path: 'visual/c/text-diagnostics/frame-render.png' }
      ]
    });
    const html = panel(render(hostile));

    expect(html).not.toContain('<script>alert(2)');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).toContain('&lt;script&gt;alert(2)&lt;/script&gt;');
    expect(html).not.toContain('etc/passwd');
    expect(html).not.toContain('evil.test');
    expect(html).not.toContain('not-attached.png');
    expect(html).toContain('src="visual/c/text-diagnostics/frame-render.png"');
  });

  it('renders nothing for metadata that is not a text diagnostics record', () => {
    expect(panel(render({ schema: 'something-else' }))).toBe('');
    expect(panel(render('nope'))).toBe('');
    expect(panel(render(null))).toBe('');
  });
});
