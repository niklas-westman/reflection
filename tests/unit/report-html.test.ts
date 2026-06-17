import { describe, expect, it } from 'vitest';
import { renderHtmlReport } from '../../src/core/report-html.js';
import type { CheckResult, ReflectionReport } from '../../src/core/report-schema.js';

function check(overrides: Partial<CheckResult> = {}): CheckResult {
  return {
    id: 'visual.button.primary',
    suite: 'visual',
    target: '/button primary',
    status: 'fail',
    severity: 'blocking',
    summary: 'Button differs.',
    artifacts: [],
    metadata: {},
    ...overrides
  };
}

function report(overrides: Partial<ReflectionReport> = {}): ReflectionReport {
  return {
    schemaVersion: 1,
    runId: 'html-report-run',
    project: 'html-report-fixture',
    startedAt: '2026-06-16T10:00:00.000Z',
    finishedAt: '2026-06-16T10:00:01.000Z',
    status: 'fail',
    mode: 'visual',
    ci: false,
    environment: { profile: 'test' },
    summary: {
      passed: 0,
      failed: 1,
      warnings: 0,
      skipped: 0,
      blockingFailures: 1,
      reviewItems: 0
    },
    checks: [check()],
    artifacts: [],
    suggestedNextSteps: [{ kind: 'fix', summary: 'Fix visual.button.primary.' }],
    ...overrides
  };
}

describe('renderHtmlReport', () => {
  it('renders a friendly static report portal with filters and visual artifacts', () => {
    const html = renderHtmlReport(
      report({
        checks: [
          check({
            artifacts: [
              { type: 'image', role: 'expected', path: 'visual/button/expected.png' },
              { type: 'image', role: 'actual', path: 'visual/button/actual.png' },
              { type: 'visual-diff', role: 'diff', path: 'visual/button/diff.png' }
            ],
            failureClass: 'token-mismatch',
            confidence: 0.8,
            diagnostics: [{ kind: 'visual-diff', message: 'Color drift detected.' }],
            recommendations: ['Check bound token values.']
          })
        ]
      })
    );

    expect(html).toContain('<title>Reflection Report · html-report-fixture · fail</title>');
    expect(html).toContain('id="check-search"');
    expect(html).toContain('href="report.json"');
    expect(html).toContain('src="visual/button/diff.png"');
    expect(html).toContain('token-mismatch · 80% confidence');
    expect(html).toContain('Check bound token values.');
  });

  it('escapes report content before embedding it in HTML', () => {
    const html = renderHtmlReport(
      report({
        project: '<script>alert(1)</script>',
        checks: [
          check({
            id: 'visual.xss',
            summary: '<img src=x onerror=alert(1)>',
            details: '</script><script>alert(1)</script>'
          })
        ]
      })
    );

    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).not.toContain('<img src=x onerror=alert(1)>');
    expect(html).not.toContain('</script><script>alert(1)</script>');
    expect(html).toContain('\\u003c/script\\u003e');
  });
});
