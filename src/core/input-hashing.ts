import { createHash } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { createBaselineStore } from './baseline-store.js';
import { canonicalJson } from './canonical-json.js';
import type { ReflectionConfig, RunMode } from './config.js';
import type { ReportInput } from './report-schema.js';

const MAX_INPUT_FILES = 10_000;

export interface DeclaredInput {
  role: string;
  // A file or a directory, relative to the config directory. Directories are walked; symlinks are not followed.
  path: string;
  // Hash JSON files by their parsed content, so formatting-only changes do not change the hash.
  canonical?: 'json' | undefined;
}

export interface HashInputsOptions {
  configDir: string;
  // Absolute path of the config file itself, when the run was started with one.
  configFile?: string | undefined;
  declared: DeclaredInput[];
  // Absolute paths of the baseline files the run compares against.
  baselineFiles: string[];
}

interface PendingInput {
  role: string;
  absolutePath: string;
  canonicalJson: boolean;
}

/**
 * Lists and hashes everything the run depended on: the config, the baselines it compares against and
 * any inputs the host declared. A missing file is recorded as missing, never as a failure: judging
 * whether that matters belongs to whoever reads the report.
 */
export async function hashReportInputs(options: HashInputsOptions): Promise<ReportInput[]> {
  const pending: PendingInput[] = [];
  if (options.configFile) {
    pending.push({ role: 'config', absolutePath: options.configFile, canonicalJson: false });
  }
  for (const baselineFile of options.baselineFiles) {
    pending.push({ role: 'baseline', absolutePath: baselineFile, canonicalJson: false });
  }
  for (const declared of options.declared) {
    pending.push(...(await expandDeclaredInput(options.configDir, declared)));
  }

  const unique = new Map<string, PendingInput>();
  for (const input of pending) {
    unique.set(`${input.role}\u0000${input.absolutePath}`, input);
  }
  if (unique.size > MAX_INPUT_FILES) {
    throw new Error(`Reflection inputs list ${unique.size} files; the limit is ${MAX_INPUT_FILES}. Declare narrower inputs.`);
  }

  const hashed = await Promise.all([...unique.values()].map((input) => hashInput(options.configDir, input)));
  return hashed.sort(compareInputs);
}

/** Absolute baseline files for the cases this mode will compare, matching which contracts the run command starts. */
export function listCaseBaselineFiles(config: ReflectionConfig, mode: RunMode): string[] {
  const { browser, component } = config.contracts;
  const cases = [
    ...((mode === 'visual' || mode === 'full') && component?.enabled !== false ? (component?.cases ?? []) : []),
    ...((mode === 'smoke' || mode === 'full') && browser?.enabled !== false ? (browser?.visualSmoke ?? []) : [])
  ];
  return cases.map((visualCase) => createBaselineStore(visualCase.baselineRoot ? { rootDir: visualCase.baselineRoot } : {}).resolveBaselinePath(visualCase.baseline));
}

async function expandDeclaredInput(configDir: string, declared: DeclaredInput): Promise<PendingInput[]> {
  const absolutePath = resolve(configDir, declared.path);
  const canonical = declared.canonical === 'json';
  const stats = await stat(absolutePath).catch(() => undefined);
  if (!stats?.isDirectory()) {
    return [{ role: declared.role, absolutePath, canonicalJson: canonical }];
  }

  const files = await listFilesRecursively(absolutePath);
  return files.map((file) => ({ role: declared.role, absolutePath: file, canonicalJson: canonical && file.endsWith('.json') }));
}

async function listFilesRecursively(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFilesRecursively(entryPath)));
    } else if (entry.isFile()) {
      files.push(entryPath);
    }
    if (files.length > MAX_INPUT_FILES) {
      throw new Error(`Reflection input directory ${directory} holds more than ${MAX_INPUT_FILES} files. Declare narrower inputs.`);
    }
  }
  return files;
}

async function hashInput(configDir: string, input: PendingInput): Promise<ReportInput> {
  const key = toKey(configDir, input.absolutePath);
  const bytes = await readFile(input.absolutePath).catch(() => undefined);
  if (!bytes) {
    return { role: input.role, key, hashKind: input.canonicalJson ? 'canonical-json' : 'bytes', missing: true };
  }

  if (!input.canonicalJson) {
    return { role: input.role, key, hashKind: 'bytes', sha256: sha256(bytes), bytes: bytes.length };
  }

  return { role: input.role, key, hashKind: 'canonical-json', sha256: sha256(canonicalJson(parseJson(key, bytes))), bytes: bytes.length };
}

function parseJson(key: string, bytes: Buffer): unknown {
  try {
    return JSON.parse(bytes.toString('utf8'));
  } catch {
    throw new Error(`Reflection input "${key}" is declared as canonical JSON but is not valid JSON.`);
  }
}

function toKey(configDir: string, absolutePath: string): string {
  const key = relative(configDir, absolutePath).split(sep).join('/');
  if (key.length === 0 || isAbsolute(key)) {
    throw new Error(`Reflection input cannot be keyed relative to the config directory: ${absolutePath}`);
  }
  return key;
}

function compareInputs(a: ReportInput, b: ReportInput): number {
  const left = `${a.role}\u0000${a.key}`;
  const right = `${b.role}\u0000${b.key}`;
  if (left === right) {
    return 0;
  }
  return left < right ? -1 : 1;
}

function sha256(value: Buffer | string): string {
  return createHash('sha256').update(value).digest('hex');
}
