// Writes schema/projection.v1.schema.json from the Zod schema, so providers written in other languages or
// repositories can validate a projection without importing this package. Run `pnpm build` first.
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { projectionSchema } from '../dist/index.js';

const outputPath = fileURLToPath(new URL('../schema/projection.v1.schema.json', import.meta.url));
const jsonSchema = z.toJSONSchema(projectionSchema, { io: 'input' });

await mkdir(fileURLToPath(new URL('../schema/', import.meta.url)), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(jsonSchema, null, 2)}\n`, 'utf8');
console.log(`Wrote ${outputPath}`);
