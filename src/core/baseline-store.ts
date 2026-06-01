import { readFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import type { CheckResult } from './report-schema.js';

export type BaselineStore = {
  rootDir: string;
  resolveBaselinePath(relativePath: string): string;
};

export type CreateBaselineStoreOptions = {
  rootDir?: string;
};

export type MissingBaselineCheckOptions = {
  id: string;
  target: string;
  baselinePath: string;
  blocking: boolean;
  metadata?: Record<string, unknown> | undefined;
};

function assertSafeRelativePath(relativePath: string): void {
  if (relativePath.length === 0 || isAbsolute(relativePath) || relativePath.split(/[\\/]/).includes('..')) {
    throw new Error(`Refusing to resolve baseline outside baseline directory: ${relativePath}`);
  }
}

function ensureInside(parent: string, child: string): void {
  const relation = relative(parent, child);
  if (relation.startsWith('..') || isAbsolute(relation)) {
    throw new Error(`Refusing to resolve baseline outside baseline directory: ${child}`);
  }
}

export function createBaselineStore(options: CreateBaselineStoreOptions = {}): BaselineStore {
  const rootDir = resolve(options.rootDir ?? '.reflection/baselines');

  return {
    rootDir,
    resolveBaselinePath(relativePath: string): string {
      assertSafeRelativePath(relativePath);
      const resolved = resolve(rootDir, relativePath);
      ensureInside(rootDir, resolved);
      return resolved;
    }
  };
}

export async function readBaselineMetadata(store: BaselineStore, relativePath: string): Promise<Record<string, unknown>> {
  const path = store.resolveBaselinePath(relativePath);
  const raw = await readFile(path, 'utf8');
  const parsed = JSON.parse(raw) as unknown;

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`Invalid baseline metadata: ${relativePath}`);
  }

  return parsed as Record<string, unknown>;
}

export function createMissingBaselineCheck(options: MissingBaselineCheckOptions): CheckResult {
  const status = options.blocking ? 'fail' : 'warn';
  const severity = options.blocking ? 'blocking' : 'review';

  return {
    id: options.id,
    suite: 'visual',
    target: options.target,
    status,
    severity,
    summary: `Missing approved visual baseline: ${options.baselinePath}.`,
    artifacts: [],
    metadata: {
      ...(options.metadata ?? {}),
      classification: 'missing-baseline',
      baselinePath: options.baselinePath
    },
    suggestedNextStep: options.blocking
      ? 'Add an approved baseline or mark this visual case as review-only until stable.'
      : 'Review the current screenshot and run reflection update for this specific case if the change is intentional.'
  };
}
