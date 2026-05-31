import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import type { ArtifactRef } from './report-schema.js';

export type ArtifactStore = {
  rootDir: string;
  runId: string;
  runDir: string;
  ensureRunDir(): Promise<void>;
  resolveRunPath(relativePath: string): string;
  writeText(relativePath: string, content: string): Promise<ArtifactRef>;
  writeBuffer(relativePath: string, content: Buffer): Promise<ArtifactRef>;
  writeJson(relativePath: string, value: unknown): Promise<ArtifactRef>;
  describeArtifact(relativePath: string, type: ArtifactRef['type'], role?: ArtifactRef['role']): Promise<ArtifactRef>;
  updateLatestPointer(): Promise<void>;
};

export type CreateArtifactStoreOptions = {
  rootDir?: string;
  runId: string;
};

function assertSafeRelativePath(relativePath: string): void {
  if (relativePath.length === 0 || isAbsolute(relativePath) || relativePath.split(/[\\/]/).includes('..')) {
    throw new Error(`Refusing to write artifact outside run directory: ${relativePath}`);
  }
}

function ensureInside(parent: string, child: string): void {
  const relation = relative(parent, child);
  if (relation.startsWith('..') || isAbsolute(relation)) {
    throw new Error(`Refusing to write artifact outside run directory: ${child}`);
  }
}

export async function createArtifactStore(options: CreateArtifactStoreOptions): Promise<ArtifactStore> {
  const rootDir = resolve(options.rootDir ?? '.reflection');
  const runDir = resolve(rootDir, 'runs', options.runId);
  ensureInside(resolve(rootDir, 'runs'), runDir);

  const resolveRunPath = (relativePath: string): string => {
    assertSafeRelativePath(relativePath);
    const resolved = resolve(runDir, relativePath);
    ensureInside(runDir, resolved);
    return resolved;
  };

  const describeArtifact = async (
    relativePath: string,
    type: ArtifactRef['type'],
    role?: ArtifactRef['role']
  ): Promise<ArtifactRef> => {
    const path = resolveRunPath(relativePath);
    const [stats, bytes] = await Promise.all([stat(path), readFile(path)]);
    return {
      type,
      ...(role ? { role } : {}),
      path: relativePath,
      bytes: stats.size,
      sha256: createHash('sha256').update(bytes).digest('hex')
    };
  };

  const writeText = async (relativePath: string, content: string): Promise<ArtifactRef> => {
    const path = resolveRunPath(relativePath);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content, 'utf8');
    return describeArtifact(relativePath, inferArtifactType(relativePath), inferArtifactRole(relativePath));
  };

  const writeBuffer = async (relativePath: string, content: Buffer): Promise<ArtifactRef> => {
    const path = resolveRunPath(relativePath);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content);
    return describeArtifact(relativePath, inferArtifactType(relativePath), inferArtifactRole(relativePath));
  };

  return {
    rootDir,
    runId: options.runId,
    runDir,
    async ensureRunDir() {
      await mkdir(runDir, { recursive: true });
    },
    resolveRunPath,
    writeText,
    writeBuffer,
    async writeJson(relativePath: string, value: unknown) {
      return writeText(relativePath, `${JSON.stringify(value, null, 2)}\n`);
    },
    describeArtifact,
    async updateLatestPointer() {
      const runsDir = resolve(rootDir, 'runs');
      await mkdir(runsDir, { recursive: true });
      await writeFile(join(runsDir, 'latest'), `${options.runId}\n`, 'utf8');
    }
  };
}

function inferArtifactType(relativePath: string): ArtifactRef['type'] {
  if (relativePath.endsWith('.json')) {
    return 'metadata';
  }

  if (relativePath.endsWith('.md') || relativePath.endsWith('.html')) {
    return 'report';
  }

  if (relativePath.endsWith('.log')) {
    return 'log';
  }

  if (relativePath.endsWith('.png')) {
    return 'screenshot';
  }

  return 'metadata';
}

function inferArtifactRole(relativePath: string): ArtifactRef['role'] | undefined {
  if (relativePath.startsWith('report.')) {
    return 'evidence';
  }

  if (relativePath.endsWith('.log')) {
    return 'debug';
  }

  if (relativePath.endsWith('/actual.png')) {
    return 'actual';
  }

  return undefined;
}
