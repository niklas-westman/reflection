import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { decisionListSchema, projectFromReflectionReport, projectionSchema, recordDecisionRequestSchema, releaseIndexSchema, type ReflectionReportLike } from '../src/index.js';
import { buildFromSample, readFixture } from './helpers/builders.js';

const schemaPath = fileURLToPath(new URL('../schema/projection.v1.schema.json', import.meta.url));
const committed = JSON.parse(readFileSync(schemaPath, 'utf8')) as object;

function compile(): ReturnType<Ajv2020['compile']> {
  const ajv = new Ajv2020({ strict: false, allErrors: true });
  addFormats(ajv);
  return ajv.compile(committed);
}

describe('committed JSON Schemas for hosting', () => {
  it('match their Zod schemas: index.json, the decision request and the decision list', () => {
    const read = (name: string): object => JSON.parse(readFileSync(fileURLToPath(new URL(`../schema/${name}`, import.meta.url)), 'utf8')) as object;
    expect(read('release-index.v1.schema.json')).toEqual(JSON.parse(JSON.stringify(z.toJSONSchema(releaseIndexSchema, { io: 'input' }))));
    expect(read('decision-request.v1.schema.json')).toEqual(JSON.parse(JSON.stringify(z.toJSONSchema(recordDecisionRequestSchema, { io: 'input' }))));
    expect(read('decision-list.v1.schema.json')).toEqual(JSON.parse(JSON.stringify(z.toJSONSchema(decisionListSchema, { io: 'input' }))));
  });
});

describe('committed JSON Schema', () => {
  it('matches the Zod schema, so a change to one is a visible change to the other', () => {
    expect(committed).toEqual(JSON.parse(JSON.stringify(z.toJSONSchema(projectionSchema, { io: 'input' }))));
  });

  it('accepts all four projections', () => {
    const validate = compile();
    const projections = [
      projectFromReflectionReport(readFixture('native-basic-react.report.json') as ReflectionReportLike),
      buildFromSample('marwes-button.sample.json'),
      buildFromSample('sourcer-login.sample.json'),
      readFixture('independent-docs-site.json')
    ];

    for (const projection of projections) {
      expect(validate(projection), JSON.stringify(validate.errors)).toBe(true);
    }
  });

  it('rejects a wrong version, a missing required field and a malformed hash', () => {
    const validate = compile();
    const projection = structuredClone(readFixture('independent-docs-site.json')) as Record<string, unknown>;

    expect(validate({ ...projection, schemaVersion: 2 })).toBe(false);
    const { inventory: _removed, ...withoutInventory } = projection;
    expect(validate(withoutInventory)).toBe(false);
    const snapshots = structuredClone(projection.snapshots) as Array<Record<string, unknown>>;
    snapshots[0] = { ...snapshots[0], sha256: 'not-a-hash' };
    expect(validate({ ...projection, snapshots })).toBe(false);
  });

  it('covers structure only: integrity rules such as unique ids and relative paths need the Zod schema', () => {
    const validate = compile();
    const projection = structuredClone(readFixture('independent-docs-site.json')) as { requirements: unknown[] };
    projection.requirements.push(projection.requirements[0]);

    expect(validate(projection)).toBe(true);
    expect(() => projectionSchema.parse(projection)).toThrow('duplicate id');
  });
});
