import { readFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runComponentVisualContract, type ComponentVisualCase } from '../../src/contracts/component/component-visual-contract.js';
import { createArtifactStore } from '../../src/core/artifact-store.js';
import type { CheckResult } from '../../src/core/report-schema.js';
import type { TextDiagnosticsRecord } from '../../src/diagnostics/text/record.js';

export const fixturesRoot = join(process.cwd(), 'tests/fixtures/text-diagnostics');

export interface FixtureSpec {
  id: string;
  storyId: string;
  fontFile: string;
  fontFamily: string;
  fontWeight: number;
  text: string;
  size: number;
  lineHeight: number;
  letterSpacing: string;
  color: string;
  frame: { width: number; height: number };
  button: { x: number; y: number; width: number; height: number; radius: number };
  colors: { background: string; button: string };
  partId: string;
  context: Record<string, string>;
}

export const interLabel: FixtureSpec = {
  id: 'inter-label',
  storyId: 'label--inter',
  fontFile: 'inter-latin-500-normal.woff',
  fontFamily: 'Inter',
  fontWeight: 500,
  text: 'Refresh',
  size: 14,
  lineHeight: 16,
  letterSpacing: '-0.42px',
  color: '#ffffff',
  frame: { width: 160, height: 64 },
  button: { x: 20, y: 14, width: 120, height: 36, radius: 8 },
  colors: { background: '#0b1020', button: '#375dfb' },
  partId: 'refresh-label',
  context: { theme: 'dark', adapter: 'fixture-html' }
};

export const loraCaption: FixtureSpec = {
  id: 'lora-caption',
  storyId: 'caption--lora',
  fontFile: 'lora-latin-400-normal.woff',
  fontFamily: 'Lora',
  fontWeight: 400,
  text: 'Skicka åäö',
  size: 16,
  lineHeight: 24,
  letterSpacing: 'normal',
  color: '#fbf8f1',
  frame: { width: 200, height: 72 },
  button: { x: 16, y: 12, width: 168, height: 48, radius: 4 },
  colors: { background: '#f7f1e3', button: '#2b3a55' },
  partId: 'send-caption',
  context: { theme: 'paper' }
};

export interface PageOverrides {
  size?: number;
  weight?: number;
  letterSpacing?: string;
  text?: string;
  fontFamily?: string;
  color?: string;
  lineHeight?: number;
  // Extra declarations on the label element, for example "transform: translateX(3px)".
  labelStyle?: string;
  // Unregistered family used instead of the fixture font, to force a fallback.
  omitFontFace?: boolean;
}

export function componentHtml(spec: FixtureSpec, overrides: PageOverrides = {}): string {
  const weight = overrides.weight ?? spec.fontWeight;
  const size = overrides.size ?? spec.size;
  const lineHeight = overrides.lineHeight ?? spec.lineHeight;
  const family = overrides.fontFamily ?? spec.fontFamily;
  const fontFace = overrides.omitFontFace
    ? ''
    : `@font-face { font-family: '${spec.fontFamily}'; src: url('/fonts/${spec.id}/${spec.fontFile}') format('woff'); font-weight: ${spec.fontWeight}; font-display: block; }`;
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    ${fontFace}
    html, body { margin: 0; width: ${spec.frame.width}px; height: ${spec.frame.height}px; background: ${spec.colors.background}; overflow: hidden; }
    #storybook-root { position: relative; width: ${spec.frame.width}px; height: ${spec.frame.height}px; }
    .button { position: absolute; left: ${spec.button.x}px; top: ${spec.button.y}px; width: ${spec.button.width}px; height: ${spec.button.height}px; border: 0; padding: 0; border-radius: ${spec.button.radius}px; background: ${spec.colors.button}; display: flex; align-items: center; justify-content: center; }
    .label { font-family: '${family}', sans-serif; font-weight: ${weight}; font-size: ${size}px; line-height: ${lineHeight}px; letter-spacing: ${overrides.letterSpacing ?? spec.letterSpacing}; color: ${overrides.color ?? spec.color}; ${overrides.labelStyle ?? ''} }
  </style>
</head>
<body><div id="storybook-root"><button class="button"><span class="label">${overrides.text ?? spec.text}</span></button></div></body>
</html>`;
}

export interface FixtureServer {
  baseUrl: string;
  requests: string[];
  setOverrides(storyId: string, overrides: PageOverrides): void;
  close(): Promise<void>;
}

export async function startFixtureServer(specs: FixtureSpec[]): Promise<FixtureServer> {
  const overrides = new Map<string, PageOverrides>();
  const requests: string[] = [];
  const server: Server = createServer((request: IncomingMessage, response: ServerResponse) => {
    void handle(request, response).catch(() => {
      response.writeHead(500);
      response.end();
    });
  });

  async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    requests.push(url.pathname);
    if (url.pathname === '/index.json') {
      const entries = Object.fromEntries(
        specs.map((spec) => [spec.storyId, { id: spec.storyId, title: spec.id, name: spec.id, type: 'story', importPath: `./${spec.id}.stories.tsx` }])
      );
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ v: 5, entries }));
      return;
    }

    if (url.pathname === '/iframe.html') {
      const spec = specs.find((candidate) => candidate.storyId === url.searchParams.get('id'));
      response.writeHead(spec ? 200 : 404, { 'content-type': 'text/html' });
      response.end(spec ? componentHtml(spec, overrides.get(spec.storyId)) : 'not found');
      return;
    }

    const fontMatch = /^\/fonts\/([^/]+)\/([^/]+)$/.exec(url.pathname);
    if (fontMatch) {
      const spec = specs.find((candidate) => candidate.id === fontMatch[1]);
      if (spec && fontMatch[2] === spec.fontFile) {
        response.writeHead(200, { 'content-type': 'font/woff' });
        response.end(await readFile(join(fixturesRoot, spec.id, 'font', spec.fontFile)));
        return;
      }
    }

    response.writeHead(404);
    response.end('not found');
  }

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Fixture server has no port.');
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    requests,
    setOverrides: (storyId, next) => overrides.set(storyId, next),
    close: () => new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
  };
}

export interface RunFixtureCaseOptions {
  baseUrl: string;
  spec: FixtureSpec;
  withDiagnostics?: boolean;
  bundlePath?: string;
  context?: Record<string, string>;
  caseOverrides?: Partial<ComponentVisualCase>;
  runId?: string;
  extraCases?: ComponentVisualCase[];
}

export function createFixtureCase(spec: FixtureSpec, options: Pick<RunFixtureCaseOptions, 'withDiagnostics' | 'bundlePath' | 'context' | 'caseOverrides'> = {}): ComponentVisualCase {
  return {
    id: spec.id,
    storyId: spec.storyId,
    viewport: 'fixture',
    viewportSize: spec.frame,
    baselineRoot: join(fixturesRoot, spec.id, 'reference'),
    baseline: 'reference.webp',
    threshold: { maxDiffPixels: 0, maxDiffPixelRatio: 0 },
    strict: true,
    ...(options.withDiagnostics
      ? {
          textDiagnostics: {
            source: options.bundlePath ?? join(fixturesRoot, spec.id, 'bundle.json'),
            parts: [{ id: spec.partId, selector: '.label' }],
            context: options.context ?? spec.context
          }
        }
      : {}),
    ...options.caseOverrides
  };
}

export interface FixtureRun {
  checks: CheckResult[];
  check: CheckResult;
  record: TextDiagnosticsRecord | undefined;
  runDir: string;
  resolveRunPath: (path: string) => string;
}

export async function runFixtureCase(options: RunFixtureCaseOptions): Promise<FixtureRun> {
  const rootDir = await mkdtemp(join(tmpdir(), 'reflection-text-diagnostics-'));
  const store = await createArtifactStore({ rootDir, runId: options.runId ?? 'text-diagnostics' });
  const { spec } = options;
  const checks = await runComponentVisualContract(
    {
      storybook: { command: 'node -e "process.exit(42)"', readyUrl: options.baseUrl, reuseExisting: true, timeoutMs: 1_000 },
      cases: [createFixtureCase(spec, options), ...(options.extraCases ?? [])],
      configDir: fixturesRoot
    },
    store
  );
  const check = checks.find((candidate) => candidate.id === `visual.${spec.id}`) as CheckResult;
  const record = check.metadata.textDiagnostics as TextDiagnosticsRecord | undefined;
  return { checks, check, record, runDir: store.runDir, resolveRunPath: (path) => store.resolveRunPath(path) };
}
