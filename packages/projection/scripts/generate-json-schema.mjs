// Writes the JSON Schemas in schema/ from the Zod schemas, so providers and hosts written in other languages or
// repositories can validate a projection, an index.json and a decision request without importing this package.
// Run `pnpm build` first.
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { decisionListSchema, projectionSchema, recordDecisionRequestSchema, releaseIndexSchema } from '../dist/index.js';

const SCHEMAS = {
  'projection.v1.schema.json': projectionSchema,
  'release-index.v1.schema.json': releaseIndexSchema,
  'decision-request.v1.schema.json': recordDecisionRequestSchema,
  'decision-list.v1.schema.json': decisionListSchema
};

await mkdir(fileURLToPath(new URL('../schema/', import.meta.url)), { recursive: true });
for (const [name, schema] of Object.entries(SCHEMAS)) {
  const outputPath = fileURLToPath(new URL(`../schema/${name}`, import.meta.url));
  await writeFile(outputPath, `${JSON.stringify(z.toJSONSchema(schema, { io: 'input' }), null, 2)}\n`, 'utf8');
  console.log(`Wrote ${outputPath}`);
}
