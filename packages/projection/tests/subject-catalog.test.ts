import { describe, expect, it } from 'vitest';
import { diffMetricSchema, httpUrlSchema, projectionSchema, sourceSnapshotSchema, subjectDimension, subjectInfoSchema } from '../src/index.js';
import { readFixture } from './helpers/builders.js';

const base = (): Record<string, unknown> => structuredClone(readFixture('independent-docs-site.json')) as Record<string, unknown>;

describe('links to a design source', () => {
  it('accepts http and https and rejects anything that could run', () => {
    expect(httpUrlSchema.safeParse('https://design.example.com/file/1').success).toBe(true);
    expect(httpUrlSchema.safeParse('http://localhost:3000/x').success).toBe(true);
    for (const bad of ['javascript:alert(1)', 'data:text/html,<script>', 'file:///etc/passwd', 'ftp://example.com/x', 'not a url', '//example.com/x']) {
      expect(httpUrlSchema.safeParse(bad).success, bad).toBe(false);
    }
  });

  it('can be set on a snapshot and on a subject, and on neither', () => {
    expect(sourceSnapshotSchema.parse({ id: 's', kind: 'k', role: 'r', capturedAt: '2026-10-18T09:00:00Z', sourceUrl: 'https://example.com/f' }).sourceUrl).toBe('https://example.com/f');
    expect(() => sourceSnapshotSchema.parse({ id: 's', kind: 'k', role: 'r', capturedAt: '2026-10-18T09:00:00Z', sourceUrl: 'javascript:alert(1)' })).toThrow();
    expect(subjectInfoSchema.parse({ id: 'button', kind: 'component' })).toEqual({ id: 'button', kind: 'component' });
  });
});

describe('the subject catalog', () => {
  it('is optional and defaults to empty', () => {
    expect(projectionSchema.parse(base()).subjects).toEqual([]);
  });

  it('carries a label, description, link and change note per subject', () => {
    const projection = projectionSchema.parse({
      ...base(),
      subjects: [{ id: 'pricing', kind: 'page', label: 'Pricing page', description: 'Plans and prices', sourceUrl: 'https://example.com/pricing', changeNote: 'New plan cards' }]
    });

    expect(projection.subjects[0]).toMatchObject({ label: 'Pricing page', changeNote: 'New plan cards' });
  });

  it('rejects the same subject listed twice, but allows a component and a page of one name', () => {
    expect(() => projectionSchema.parse({ ...base(), subjects: [{ id: 'login', kind: 'page' }, { id: 'login', kind: 'page' }] })).toThrow('duplicate subject');
    expect(projectionSchema.parse({ ...base(), subjects: [{ id: 'login', kind: 'page' }, { id: 'login', kind: 'component' }] }).subjects).toHaveLength(2);
  });

  it('rejects a script link in the catalog', () => {
    expect(() => projectionSchema.parse({ ...base(), subjects: [{ id: 'a', kind: 'page', sourceUrl: 'javascript:alert(1)' }] })).toThrow();
  });
});

describe('presentation hints', () => {
  it('names dimensions to group, place side by side and section by, all optional', () => {
    const entry = subjectInfoSchema.parse({ id: 'login', kind: 'page', presentation: { groupBy: 'state', columns: 'device', sections: 'surface' } });
    expect(entry.presentation).toEqual({ groupBy: 'state', columns: 'device', sections: 'surface' });
    expect(subjectInfoSchema.parse({ id: 'login', kind: 'page', presentation: {} }).presentation).toEqual({});
    expect(subjectInfoSchema.safeParse({ id: 'login', kind: 'page', presentation: { groupBy: '' } }).success).toBe(false);
  });

  it('reads a dimension from the common subject keys or from the provider\'s own dimensions', () => {
    const subject = { kind: 'page' as const, id: 'login', state: 'request-code', dimensions: { device: 'mobile', surface: 'app' } };
    expect(subjectDimension(subject, 'state')).toBe('request-code');
    expect(subjectDimension(subject, 'device')).toBe('mobile');
    expect(subjectDimension(subject, 'variant')).toBeUndefined();
    expect(subjectDimension(subject, 'missing')).toBeUndefined();
  });
});

describe('what a metric means', () => {
  it('takes an optional label, unit, direction and passing line, and still accepts a bare name and value', () => {
    expect(diffMetricSchema.parse({ name: 'pixelmatch-match-percent', value: 99.75, label: 'Match', unit: '%', direction: 'higher-is-better', passAt: 95 }).passAt).toBe(95);
    expect(diffMetricSchema.parse({ name: 'diff-pixels', value: 12 }).direction).toBeUndefined();
    expect(diffMetricSchema.safeParse({ name: 'x', value: 1, direction: 'up' }).success).toBe(false);
  });
});
