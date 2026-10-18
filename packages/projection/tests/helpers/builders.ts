import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { projectionSchema, summarizeReadiness, type Comparison, type Projection, type Requirement } from '../../src/index.js';

export function readFixture(name: string): unknown {
  return JSON.parse(readFileSync(fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url)), 'utf8'));
}

interface SampleCounts {
  required: number;
  proven: number;
  failing: number;
  needsDesign: number | null;
  notEnrolled: number | null;
}

interface ProjectionSample {
  project: Projection['project'];
  provider: Projection['provider'];
  snapshots: Projection['snapshots'];
  runs: Projection['runs'];
  requirements: Requirement[];
  comparisons: Comparison[];
  counts: SampleCounts;
}

/**
 * Builds a full projection from a real sample plus placeholders, so the counts the real project reported
 * (273 required for Marwes Button, 30 for Sourcer Login) can be asserted without committing hundreds of
 * invented-looking records. Everything beyond the sample's own requirements and comparisons is a placeholder
 * whose id starts with "placeholder/".
 */
export function buildFromSample(sampleFile: string): Projection {
  const sample = readFixture(sampleFile) as ProjectionSample;
  const concepts = sample.provider.readinessConcepts;
  const requirements = [...sample.requirements];
  const comparisons = [...sample.comparisons];
  const real = summarizeReadiness(requirements, comparisons, concepts);
  const snapshotId = sample.snapshots[0]?.id;
  const runId = sample.runs[0]?.id;

  addPlaceholders('proven', sample.counts.proven - real.proven, (index) => {
    const id = `placeholder/proven-${pad(index)}`;
    requirements.push({ id, subject: { kind: 'component', id: 'placeholder' }, requiredProofs: ['visual'], enrolled: true });
    comparisons.push({
      id: `${id}/comparison`,
      requirementId: id,
      subject: { kind: 'component', id: 'placeholder' },
      ...(runId ? { runId } : {}),
      ...(snapshotId ? { snapshotId } : {}),
      proof: { visual: 'passed' },
      verdict: { status: 'pass', severity: 'review' }
    });
  });
  addPlaceholders('failing', sample.counts.failing - real.failing, () => {
    throw new Error('The samples have no failing requirements, so no failing placeholder is needed.');
  });
  addPlaceholders('needs-design', (sample.counts.needsDesign ?? 0) - (real.needsDesign ?? 0), (index) => {
    requirements.push({
      id: `placeholder/needs-design-${pad(index)}`,
      subject: { kind: 'component', id: 'placeholder' },
      requiredProofs: ['visual'],
      enrolled: false,
      design: { availability: 'missing' }
    });
  });
  addPlaceholders('not-enrolled', (sample.counts.notEnrolled ?? 0) - (real.notEnrolled ?? 0), (index) => {
    requirements.push({ id: `placeholder/not-enrolled-${pad(index)}`, subject: { kind: 'component', id: 'placeholder' }, requiredProofs: ['visual'], enrolled: false });
  });

  return projectionSchema.parse({
    schemaVersion: 1,
    project: sample.project,
    provider: sample.provider,
    generatedAt: sample.runs[0]?.finishedAt ?? '2026-10-18T00:00:00Z',
    inventory: 'full',
    snapshots: sample.snapshots,
    runs: sample.runs,
    requirements,
    comparisons
  });
}

function addPlaceholders(bucket: string, count: number, add: (index: number) => void): void {
  if (count < 0) {
    throw new Error(`The sample already has more ${bucket} requirements than the real count.`);
  }
  for (let index = 1; index <= count; index += 1) {
    add(index);
  }
}

function pad(index: number): string {
  return String(index).padStart(3, '0');
}
