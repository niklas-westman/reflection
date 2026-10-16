import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { mkdtemp, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, type Page } from 'playwright';
import { runComponentVisualContract, type ComponentVisualCase } from '../../src/contracts/component/component-visual-contract.js';
import { createArtifactStore } from '../../src/core/artifact-store.js';
import type { CheckResult } from '../../src/core/report-schema.js';

export const frame = { width: 160, height: 80 };

export interface PressableOptions {
  noActive?: boolean;
  disabled?: boolean;
  overlay?: boolean;
  pointerNone?: boolean;
  hidden?: boolean;
  duplicate?: boolean;
  offscreen?: boolean;
  raf?: boolean;
}

export interface SpinnerOptions {
  // Negative animation delay in ms: gives the uncontrolled capture a different phase on every run.
  offsetMs?: number;
  waapi?: boolean;
  raf?: boolean;
  canvas?: boolean;
  finite?: boolean;
  width?: number;
  color?: string;
  text?: string;
}

function baseStyle(): string {
  return `html, body { margin: 0; width: ${frame.width}px; height: ${frame.height}px; background: #101820; overflow: hidden; font-family: Arial, sans-serif; }
    #storybook-root { position: relative; width: ${frame.width}px; height: ${frame.height}px; }`;
}

export function pressableHtml(options: PressableOptions = {}): string {
  const top = options.offscreen ? 400 : 20;
  const button = (extra = '') =>
    `<button class="btn" ${options.disabled ? 'disabled' : ''} ${extra}><span class="label">Press</span></button>`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    ${baseStyle()}
    .btn { position: absolute; left: 20px; top: ${top}px; width: 120px; height: 40px; border: 0; border-radius: 8px; background: #3a6ff7; color: #fff; font: 600 14px/16px Arial, sans-serif; transition: background 400ms; cursor: pointer; ${options.pointerNone ? 'pointer-events: none;' : ''} ${options.hidden ? 'display: none;' : ''} }
    .btn:hover { background: #1fa36b; }
    ${options.noActive ? '' : '.btn:active { background: #d9363e; }'}
    .btn:focus { outline: 3px solid #ffd54a; outline-offset: 2px; }
    .cover { position: absolute; left: 0; top: 0; width: ${frame.width}px; height: ${frame.height}px; background: rgba(0, 0, 0, 0.01); }
    .raf { position: absolute; top: 66px; width: 10px; height: 10px; background: #fff; }
  </style></head><body><div id="storybook-root">${button()}${options.duplicate ? button() : ''}${options.overlay ? '<div class="cover"></div>' : ''}${options.raf ? '<div class="raf"></div>' : ''}</div>
  <script>
    const log = (event) => fetch('/log?e=' + event, { keepalive: true });
    document.addEventListener('mousedown', () => log('down'));
    document.addEventListener('mouseup', () => log('up'));
    document.addEventListener('click', (event) => { if (event.target instanceof Element && event.target.closest('.btn')) log('target-click'); else log('ancestor-click'); });
    ${options.raf ? "const marker = document.querySelector('.raf'); const tick = () => { marker.style.left = ((performance.now() / 8) % 140) + 'px'; requestAnimationFrame(tick); }; requestAnimationFrame(tick);" : ''}
  </script></body></html>`;
}

export function spinnerHtml(options: SpinnerOptions = {}): string {
  const offset = options.offsetMs ?? 0;
  const width = options.width ?? 40;
  const color = options.color ?? '#4cc9f0';
  const spin = !options.waapi && !options.raf && !options.canvas;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    ${baseStyle()}
    .marker { position: absolute; left: ${80 - width / 2}px; top: 20px; width: ${width}px; height: 8px; background: ${color}; transform-origin: 50% 50%; ${spin && !options.finite ? `animation: spin 800ms linear infinite; animation-delay: -${offset}ms;` : ''} }
    @keyframes spin { to { transform: rotate(360deg); } }
    .badge { position: absolute; left: 20px; top: 50px; width: 14px; height: 14px; background: #f72585; opacity: 0.3; ${options.finite ? `animation: appear 500ms ease forwards; animation-delay: -${offset % 400}ms;` : ''} }
    @keyframes appear { to { opacity: 1; } }
    .text { position: absolute; left: 44px; top: 48px; color: #fff; font: 14px/18px Arial, sans-serif; }
    canvas { position: absolute; left: 100px; top: 40px; }
  </style></head><body><div id="storybook-root"><div class="marker"></div><div class="badge"></div><div class="text">${options.text ?? 'Loading'}</div>${options.canvas ? '<canvas width="40" height="30"></canvas>' : ''}</div>
  <script>
    ${options.waapi ? `document.querySelector('.marker').animate([{ transform: 'rotate(0deg)' }, { transform: 'rotate(360deg)' }], { duration: 800, iterations: Infinity, delay: -${offset} });` : ''}
    ${options.raf ? "const marker = document.querySelector('.marker'); const tick = () => { marker.style.transform = 'rotate(' + ((performance.now() / 800) * 360) % 360 + 'deg)'; requestAnimationFrame(tick); }; requestAnimationFrame(tick);" : ''}
    ${options.canvas ? "const context = document.querySelector('canvas').getContext('2d'); const draw = () => { context.clearRect(0, 0, 40, 30); context.fillStyle = '#fff'; context.fillRect((performance.now() / 8) % 30, 5, 8, 8); requestAnimationFrame(draw); }; requestAnimationFrame(draw);" : ''}
  </script></body></html>`;
}

export interface CaptureFixtureServer {
  baseUrl: string;
  events: string[];
  pressable: PressableOptions;
  spinner: SpinnerOptions;
  reset(): void;
  close(): Promise<void>;
}

export async function startCaptureFixtureServer(): Promise<CaptureFixtureServer> {
  const state = { pressable: {} as PressableOptions, spinner: {} as SpinnerOptions };
  const events: string[] = [];
  const server: Server = createServer((request: IncomingMessage, response: ServerResponse) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    if (url.pathname === '/index.json') {
      const entries = Object.fromEntries(
        ['pressable', 'spinner'].map((id) => [id, { id, title: id, name: id, type: 'story', importPath: `./${id}.stories.tsx` }])
      );
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ v: 5, entries }));
      return;
    }
    if (url.pathname === '/log') {
      events.push(url.searchParams.get('e') ?? '');
      response.writeHead(204);
      response.end();
      return;
    }
    if (url.pathname === '/iframe.html') {
      const id = url.searchParams.get('id');
      const html = id === 'pressable' ? pressableHtml(state.pressable) : id === 'spinner' ? spinnerHtml(state.spinner) : undefined;
      response.writeHead(html ? 200 : 404, { 'content-type': 'text/html' });
      response.end(html ?? 'not found');
      return;
    }
    response.writeHead(404);
    response.end('not found');
  });
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
    events,
    get pressable() {
      return state.pressable;
    },
    set pressable(value: PressableOptions) {
      state.pressable = value;
    },
    get spinner() {
      return state.spinner;
    },
    set spinner(value: SpinnerOptions) {
      state.spinner = value;
    },
    reset() {
      state.pressable = {};
      state.spinner = {};
      events.length = 0;
    },
    close: () => new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
  } as CaptureFixtureServer;
}

// Independent reference capture with plain Playwright: the specification Reflection's capture is compared against.
export async function captureReference(url: string, path: string, act?: (page: Page) => Promise<void>): Promise<void> {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: frame, deviceScaleFactor: 1, locale: 'en-US', timezoneId: 'Europe/Stockholm', colorScheme: 'light' });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 2_000 }).catch(() => undefined);
    await act?.(page);
    await page.screenshot({ path });
    await context.close();
  } finally {
    await browser.close();
  }
}

export const noMotionStyle = '*, *::before, *::after { animation: none !important; transition: none !important; }';

export async function makeBaselineRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'reflection-capture-policy-'));
  await mkdir(root, { recursive: true });
  return root;
}

export interface RunCaseOptions {
  baseUrl: string;
  story: 'pressable' | 'spinner';
  baselineRoot: string;
  baseline?: string;
  caseOverrides?: Partial<ComponentVisualCase>;
  extraCases?: ComponentVisualCase[];
  runId?: string;
}

export function captureCase(options: Pick<RunCaseOptions, 'story' | 'baselineRoot' | 'baseline' | 'caseOverrides'> & { id?: string }): ComponentVisualCase {
  return {
    id: options.id ?? options.story,
    storyId: options.story,
    viewport: 'fixture',
    viewportSize: frame,
    baselineRoot: options.baselineRoot,
    baseline: options.baseline ?? `${options.story}.png`,
    threshold: { maxDiffPixels: 0, maxDiffPixelRatio: 0 },
    strict: true,
    ...options.caseOverrides
  };
}

export async function runCase(options: RunCaseOptions): Promise<{ check: CheckResult; checks: CheckResult[]; resolveRunPath: (path: string) => string }> {
  const store = await createArtifactStore({ rootDir: await mkdtemp(join(tmpdir(), 'reflection-capture-run-')), runId: options.runId ?? 'capture-policy' });
  const primary = captureCase(options);
  const checks = await runComponentVisualContract(
    {
      storybook: { command: 'node -e "process.exit(42)"', readyUrl: options.baseUrl, reuseExisting: true, timeoutMs: 1_000 },
      cases: [primary, ...(options.extraCases ?? [])]
    },
    store
  );
  return { checks, check: checks.find((check) => check.id === `visual.${primary.id}`) as CheckResult, resolveRunPath: (path) => store.resolveRunPath(path) };
}
