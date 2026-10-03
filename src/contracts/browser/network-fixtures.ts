import { readFile } from 'node:fs/promises';
import { extname, isAbsolute, relative, resolve } from 'node:path';
import type { BrowserContext, Request, Route } from 'playwright';
import type { NetworkSetup, NetworkStubConfig } from '../../core/browser-scenario.js';

type UnmatchedPolicy = NonNullable<NetworkSetup['unmatched']>;

export interface UnmatchedRequest {
  method: string;
  url: string;
}

export interface NetworkFixtureSummary {
  stubs: Array<{
    method: string;
    url: string;
    status: number;
    source: 'json' | 'file' | 'body' | 'empty';
    file?: string;
    once: boolean;
    delayMs?: number;
    hits: number;
  }>;
  unmatchedPolicy: UnmatchedPolicy;
  unmatchedRequests: UnmatchedRequest[];
}

export interface NetworkFixtureHandle {
  unmatchedRequests(): UnmatchedRequest[];
  summary(): NetworkFixtureSummary | undefined;
}

export interface InstallNetworkFixturesInput {
  context: BrowserContext;
  network: NetworkSetup | undefined;
  baseUrl: string;
  configDir: string;
}

interface NormalizedStub extends NetworkStubConfig {
  status: number;
}

interface PreparedStub {
  config: NormalizedStub;
  fileContent?: Buffer;
  hits: number;
}

// Same-origin requests of these types are the app's own assets, not data fetches.
const staticResourceTypes = new Set(['document', 'script', 'stylesheet', 'image', 'font', 'media', 'manifest', 'texttrack', 'other']);

export async function installNetworkFixtures(input: InstallNetworkFixturesInput): Promise<NetworkFixtureHandle> {
  const network = input.network;
  const stubConfigs = network?.stubs ?? [];
  const unmatchedPolicy: UnmatchedPolicy = network?.unmatched ?? 'allow';
  if (!network || (stubConfigs.length === 0 && unmatchedPolicy === 'allow')) {
    return { unmatchedRequests: () => [], summary: () => undefined };
  }

  const unmatched: UnmatchedRequest[] = [];
  const prepared = await Promise.all(stubConfigs.map((stub) => prepareStub(stub, input.configDir)));
  const appOrigin = new URL(input.baseUrl).origin;
  const allowedOrigins = new Set(network.allowOrigins ?? []);

  // Routes registered later run first, so the catch-all goes in first and only sees requests no stub handled.
  if (unmatchedPolicy !== 'allow') {
    await input.context.route('**/*', async (route) => {
      const request = route.request();
      if (isPassThroughRequest(request, appOrigin, allowedOrigins)) {
        await route.continue();
        return;
      }

      unmatched.push({ method: request.method(), url: request.url() });
      if (unmatchedPolicy === 'fail') {
        await route.abort('blockedbyclient');
        return;
      }
      await route.continue();
    });
  }

  for (const stub of prepared) {
    await input.context.route(stub.config.url, (route, request) => fulfillStub(route, request, stub));
  }

  return {
    unmatchedRequests: () => [...unmatched],
    summary: () => ({
      stubs: prepared.map((stub) => describeStub(stub)),
      unmatchedPolicy,
      unmatchedRequests: [...unmatched]
    })
  };
}

async function prepareStub(stub: NetworkStubConfig, configDir: string): Promise<PreparedStub> {
  const config: NormalizedStub = { ...stub, status: stub.status ?? 200, ...(stub.method ? { method: stub.method.toUpperCase() } : {}) };
  if (config.file === undefined) {
    return { config, hits: 0 };
  }

  const root = resolve(configDir);
  const filePath = resolve(root, config.file);
  const relation = relative(root, filePath);
  if (relation.startsWith('..') || isAbsolute(relation)) {
    throw new Error(`Network stub file escapes the config directory: ${config.file}`);
  }

  try {
    return { config, fileContent: await readFile(filePath), hits: 0 };
  } catch (error) {
    throw new Error(`Network stub file could not be read: ${config.file}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function isPassThroughRequest(request: Request, appOrigin: string, allowedOrigins: Set<string>): boolean {
  const url = new URL(request.url());
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return true;
  }

  if (allowedOrigins.has(url.origin)) {
    return true;
  }

  return url.origin === appOrigin && staticResourceTypes.has(request.resourceType());
}

async function fulfillStub(route: Route, request: Request, stub: PreparedStub): Promise<void> {
  const { config } = stub;
  if (config.method !== undefined && config.method !== request.method()) {
    await route.fallback();
    return;
  }

  if (config.once === true && stub.hits > 0) {
    await route.fallback();
    return;
  }

  stub.hits += 1;
  if (config.delayMs) {
    await new Promise((done) => setTimeout(done, config.delayMs));
  }

  const { contentType, body } = resolveStubBody(stub);
  await route.fulfill({
    status: config.status,
    headers: { 'access-control-allow-origin': '*', ...(config.headers ?? {}) },
    ...(contentType ? { contentType } : {}),
    ...(body !== undefined ? { body } : {})
  });
}

function resolveStubBody(stub: PreparedStub): { contentType?: string; body?: string | Buffer } {
  const { config } = stub;
  if (config.json !== undefined) {
    return { contentType: 'application/json', body: JSON.stringify(config.json) };
  }

  if (stub.fileContent !== undefined) {
    return { contentType: extname(config.file ?? '') === '.json' ? 'application/json' : 'text/plain', body: stub.fileContent };
  }

  if (config.body !== undefined) {
    return { contentType: 'text/plain', body: config.body };
  }

  return {};
}

function describeStub(stub: PreparedStub): NetworkFixtureSummary['stubs'][number] {
  const { config } = stub;
  const source = config.json !== undefined ? 'json' : config.file !== undefined ? 'file' : config.body !== undefined ? 'body' : 'empty';
  return {
    method: config.method ?? 'ANY',
    url: config.url,
    status: config.status,
    source,
    ...(config.file !== undefined ? { file: config.file } : {}),
    once: config.once === true,
    ...(config.delayMs ? { delayMs: config.delayMs } : {}),
    hits: stub.hits
  };
}
