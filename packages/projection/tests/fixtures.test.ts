import { describe, expect, it } from 'vitest';
import { projectFromReflectionReport, projectionSchema, summarizeProjection, type ReflectionReportLike } from '../src/index.js';
import { buildFromSample, readFixture } from './helpers/builders.js';

describe('four projections of real and independent shapes', () => {
  it('projects a native Reflection report and says the inventory is executed-only', () => {
    const report = readFixture('native-basic-react.report.json') as ReflectionReportLike;

    const projection = projectFromReflectionReport(report);

    expect(projection.inventory).toBe('executed-only');
    expect(projection.requirements.map((requirement) => requirement.id)).toEqual(['visual.login-mobile']);
    expect(projection.runs[0]?.verdictHash).toBe(report.resultHash?.verdict);
    expect(projection.runs[0]?.inputs?.map((input) => input.role)).toEqual(['baseline', 'config']);
    expect(summarizeProjection(projection)).toEqual({ required: 1, proven: 1, failing: 0, needsDesign: null, notEnrolled: null, unknown: 0 });
    expect(JSON.stringify(projection)).not.toContain('/Users/');
  });

  it('shows Marwes Button as 273 required, 203 proven and 0 failing, never as blocked', () => {
    const projection = buildFromSample('marwes-button.sample.json');

    expect(summarizeProjection(projection)).toEqual({ required: 273, proven: 203, failing: 0, needsDesign: 14, notEnrolled: 56, unknown: 0 });
    // Marwes calls every row "blocked" because coverage gaps are folded into proof. Here proof carries only proof.
    expect(projection.comparisons.some((comparison) => Object.values(comparison.proof).some((outcome) => outcome === 'failed'))).toBe(false);
    expect(JSON.stringify(projection.comparisons.map((comparison) => comparison.proof))).not.toContain('blocked');
  });

  it('keeps real Marwes details: a needs-design requirement with its reason, no reference approval, the proof-source snapshot', () => {
    const projection = buildFromSample('marwes-button.sample.json');

    const needsDesign = projection.requirements.find((requirement) => requirement.id === 'public.neutral.loading.light');
    expect(needsDesign?.design?.availability).toBe('missing');
    expect(needsDesign?.design?.reason).toContain('Request an explicit composition rule');
    expect(projection.comparisons.every((comparison) => comparison.reference?.approval.state !== 'holds')).toBe(true);
    expect(projection.snapshots[0]).toMatchObject({ kind: 'figma', role: 'proof-source', originalFileKey: 'VTv3dNTvt7R5EytQF47XbB' });
  });

  it('keeps a comparison with a not-run layer visible instead of calling it proven', () => {
    const projection = buildFromSample('marwes-button.sample.json');

    const behaviorOnly = projection.comparisons.find((comparison) => comparison.id === 'marwes/button/button.behavior-submit/light/react');
    expect(behaviorOnly?.proof).toMatchObject({ behavior: 'passed', structural: 'not-run', visual: 'not-run' });
    expect(behaviorOnly?.limitations).toContain('no design reference: behavior-only case');
  });

  it('shows Sourcer Login as 30 of 30 proven with needs-design and not-enrolled unknown, not zero', () => {
    const projection = buildFromSample('sourcer-login.sample.json');

    expect(summarizeProjection(projection)).toEqual({ required: 30, proven: 30, failing: 0, needsDesign: null, notEnrolled: null, unknown: 0 });
  });

  it('imports Sourcer reference approval as recorded by an agent, never as a human approval', () => {
    const projection = buildFromSample('sourcer-login.sample.json');

    const real = projection.comparisons.filter((comparison) => comparison.id.startsWith('sourcer/login/'));
    const approvals = real.map((comparison) => comparison.reference?.approval);

    expect(real).toHaveLength(5);
    expect(approvals.every((approval) => approval?.state === 'holds' && approval.attestation === 'agent')).toBe(true);
    expect(approvals.some((approval) => approval?.attestation === 'human')).toBe(false);
  });

  it('represents an independent project with browsers as adapters, no design tool and a mix of readiness', () => {
    const projection = projectionSchema.parse(readFixture('independent-docs-site.json'));

    expect(projection.snapshots[0]?.kind).toBe('screenshots');
    expect(new Set(projection.comparisons.map((comparison) => comparison.subject.adapter))).toEqual(new Set(['chrome', 'firefox']));
    expect(summarizeProjection(projection)).toEqual({ required: 8, proven: 3, failing: 1, needsDesign: null, notEnrolled: 2, unknown: 2 });
  });

  it('keeps missing required rows in the independent project denominator', () => {
    const projection = projectionSchema.parse(readFixture('independent-docs-site.json'));

    const footer = projection.requirements.filter((requirement) => requirement.id.startsWith('pricing/footer'));
    expect(footer).toHaveLength(2);
    expect(projection.comparisons.some((comparison) => comparison.requirementId?.startsWith('pricing/footer'))).toBe(false);
  });
});
