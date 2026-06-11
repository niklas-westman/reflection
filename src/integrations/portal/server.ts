import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { InlineConfig } from 'vite';
import { createServer } from 'vite';
import type { ManagedServer } from '../../core/server-manager.js';
import { waitForUrl } from '../../core/server-manager.js';
import type { ViewportSize } from '../playwright/context-factory.js';
import type { ComponentFraming } from '../../contracts/component/component-visual-contract.js';

export type PortalComponentCase = {
  id: string;
  path: string;
  viewport: string;
  viewportSize: ViewportSize;
  framing?: ComponentFraming | undefined;
};

export type PortalConfig = {
  entry: string;
  readyUrl: string;
  reuseExisting?: boolean | undefined;
  timeoutMs?: number | undefined;
  viteConfig?: string | undefined;
};

export type ReflectionPortalServer = {
  baseUrl: string;
  server: ManagedServer;
};

export async function startReflectionPortalServer(
  config: PortalConfig,
  cases: PortalComponentCase[],
  options: { cwd: string; rootDir: string }
): Promise<ReflectionPortalServer> {
  if ((config.reuseExisting ?? true) && (await isUrlReachable(config.readyUrl))) {
    return {
      baseUrl: config.readyUrl,
      server: {
        readyUrl: config.readyUrl,
        reused: true,
        started: false,
        pid: undefined,
        stop: async () => undefined
      }
    };
  }

  const rootDir = resolve(options.rootDir);
  await mkdir(rootDir, { recursive: true });
  await writePortalFiles({
    rootDir,
    entryPath: resolve(options.cwd, config.entry),
    cases
  });

  const readyUrl = new URL(config.readyUrl);
  const port = Number(readyUrl.port || (readyUrl.protocol === 'https:' ? 443 : 80));
  const host = readyUrl.hostname || '127.0.0.1';
  const vite = await createServer(createViteConfig({ config, rootDir, host, port, cwd: options.cwd }));

  try {
    await vite.listen();
    await waitForUrl(config.readyUrl, { timeoutMs: config.timeoutMs ?? 60_000 });
  } catch (error) {
    await vite.close();
    await rm(rootDir, { recursive: true, force: true });
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Reflection portal did not become ready at ${config.readyUrl}: ${message}`);
  }

  return {
    baseUrl: config.readyUrl,
    server: {
      readyUrl: config.readyUrl,
      reused: false,
      started: true,
      pid: undefined,
      stop: async () => {
        await vite.close();
      }
    }
  };
}

function createViteConfig(input: { config: PortalConfig; rootDir: string; host: string; port: number; cwd: string }): InlineConfig {
  return {
    root: input.rootDir,
    configFile: input.config.viteConfig ? resolve(input.cwd, input.config.viteConfig) : false,
    appType: 'spa',
    logLevel: 'silent',
    server: {
      host: input.host,
      port: input.port,
      strictPort: true,
      hmr: false,
      fs: {
        allow: [input.cwd, input.rootDir, dirname(resolve(input.cwd, input.config.entry))]
      }
    }
  };
}

async function writePortalFiles(input: { rootDir: string; entryPath: string; cases: PortalComponentCase[] }): Promise<void> {
  await writeFile(
    resolve(input.rootDir, 'index.html'),
    [
      '<!doctype html>',
      '<html>',
      '<head>',
      '  <meta charset="utf-8" />',
      '  <meta name="viewport" content="width=device-width, initial-scale=1" />',
      '  <title>Reflection Portal</title>',
      '</head>',
      '<body>',
      '  <script type="module" src="/reflection-portal.js"></script>',
      '</body>',
      '</html>',
      ''
    ].join('\n'),
    'utf8'
  );

  await writeFile(resolve(input.rootDir, 'reflection-portal.js'), renderPortalScript(input), 'utf8');
}

function renderPortalScript(input: { entryPath: string; cases: PortalComponentCase[] }): string {
  return `
import { mountReflectionCase } from "${toViteFsImport(input.entryPath)}";

const cases = ${JSON.stringify(input.cases.map((visualCase) => serializePortalCase(visualCase)))};

const state = globalThis;
state.__reflectionPortalReady = false;
state.__reflectionPortalError = undefined;

function normalizePath(path) {
  if (!path.startsWith("/")) return \`/\${path}\`;
  return path;
}

function setPortalError(error) {
  state.__reflectionPortalError = error instanceof Error ? error.message : String(error);
  state.__reflectionPortalReady = false;
}

function applyFrame(frame, caseRoot, visualCase) {
  const framing = visualCase.framing;
  const background = framing.background || "transparent";
  document.documentElement.style.cssText = "margin:0;width:100%;height:100%;overflow:hidden;background:" + background;
  document.body.style.cssText = "margin:0;width:100%;height:100%;overflow:hidden;background:" + background;

  frame.style.boxSizing = "border-box";
  frame.style.width = visualCase.viewportSize.width + "px";
  frame.style.height = visualCase.viewportSize.height + "px";
  frame.style.margin = "0";
  frame.style.padding = framing.padding + "px";
  frame.style.background = background;
  frame.style.overflow = "hidden";

  if (framing.align === "center") {
    frame.style.display = "grid";
    frame.style.placeItems = "center";
  } else {
    frame.style.display = "block";
    caseRoot.style.width = "100%";
    caseRoot.style.height = "100%";
  }
}

async function boot() {
  const currentPath = normalizePath(window.location.pathname);
  const visualCase = cases.find((entry) => normalizePath(entry.path) === currentPath);
  if (!visualCase) {
    throw new Error("No Reflection portal case configured for " + currentPath);
  }

  document.body.innerHTML = '<main id="reflection-root"><div id="reflection-case-root"></div></main>';
  const frame = document.getElementById("reflection-root");
  const caseRoot = document.getElementById("reflection-case-root");
  applyFrame(frame, caseRoot, visualCase);

  const cleanup = await mountReflectionCase({
    id: visualCase.id,
    path: visualCase.path,
    root: caseRoot,
    viewport: visualCase.viewport,
    viewportSize: visualCase.viewportSize,
    framing: {
      background: visualCase.framing.background,
      align: visualCase.framing.align,
      padding: visualCase.framing.padding
    }
  });

  state.__reflectionPortalCleanup = cleanup;
  state.__reflectionPortalReady = true;
}

boot().catch(setPortalError);
`;
}

function serializePortalCase(visualCase: PortalComponentCase): PortalComponentCase {
  return {
    ...visualCase,
    framing: {
      rootSelector: visualCase.framing?.rootSelector ?? '#reflection-root',
      background: visualCase.framing?.background,
      align: visualCase.framing?.align ?? 'center',
      padding: visualCase.framing?.padding ?? 0
    }
  };
}

function toViteFsImport(path: string): string {
  return `/@fs/${path.replaceAll('\\', '/')}`;
}

async function isUrlReachable(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { cache: 'no-store' });
    await response.body?.cancel();
    return response.status >= 200 && response.status < 500;
  } catch {
    return false;
  }
}
