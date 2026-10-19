import { describe, expect, it } from 'vitest';
import { httpUrlSchema, projectionSchema, sourceSnapshotSchema, subjectInfoSchema } from '../src/index.js';
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
