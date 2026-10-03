import { access } from 'node:fs/promises';
import { CommanderError } from 'commander';
import { loadReflectionConfig, type ReflectionConfig } from '../core/config.js';
import { ExitCode } from '../core/exit-codes.js';
import { getRouteViewportName, isCustomRouteViewport } from '../core/viewport.js';

export type DoctorCommandOptions = {
  config?: string;
  checkServer?: boolean;
};

type RuntimeReadiness = {
  nodeSupported: boolean;
  playwrightAvailable: boolean;
  chromiumExecutable?: string;
  chromiumExecutableFound?: boolean;
};

const minimumNodeMajor = 22;

export async function doctorCommand(options: DoctorCommandOptions = {}): Promise<void> {
  let config: ReflectionConfig | undefined;

  if (options.config) {
    try {
      config = await loadReflectionConfig(options.config);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(message);
      throw new CommanderError(ExitCode.ToolOrConfigError, 'reflection.doctor', message);
    }
  }

  const runtime = await checkRuntimeReadiness();
  const serverReachability = options.checkServer === true && config ? await checkConfiguredServerReachability(config) : undefined;
  const status = runtime.nodeSupported && runtime.playwrightAvailable ? 'pass' : 'error';

  console.log('Reflection doctor');
  console.log('');
  console.log(`Status: ${status}`);
  console.log(`Node: ${process.version} (${runtime.nodeSupported ? 'supported' : `requires >=${minimumNodeMajor}`})`);
  console.log(`Playwright package: ${runtime.playwrightAvailable ? 'available' : 'missing'}`);
  if (runtime.chromiumExecutable) {
    console.log(`Chromium browser: ${runtime.chromiumExecutableFound ? 'found' : 'not found'} at ${runtime.chromiumExecutable}`);
  }
  console.log(`Config: ${options.config ?? 'not provided'}`);

  if (config) {
    printConfigSummary(config, serverReachability);
  }

  if (!runtime.nodeSupported) {
    throw new CommanderError(
      ExitCode.MissingDependency,
      'reflection.doctor',
      `Reflection requires Node.js >=${minimumNodeMajor}. Current version: ${process.version}`
    );
  }

  if (!runtime.playwrightAvailable) {
    throw new CommanderError(ExitCode.MissingDependency, 'reflection.doctor', 'Reflection requires the playwright package.');
  }
}

async function checkRuntimeReadiness(): Promise<RuntimeReadiness> {
  const nodeMajor = Number(process.versions.node.split('.')[0] ?? '0');

  try {
    const playwright = (await import('playwright')) as typeof import('playwright');
    const chromiumExecutable = playwright.chromium.executablePath();
    return {
      nodeSupported: nodeMajor >= minimumNodeMajor,
      playwrightAvailable: true,
      chromiumExecutable,
      chromiumExecutableFound: await pathExists(chromiumExecutable)
    };
  } catch {
    return {
      nodeSupported: nodeMajor >= minimumNodeMajor,
      playwrightAvailable: false
    };
  }
}

function printConfigSummary(config: ReflectionConfig, serverReachability: string | undefined): void {
  console.log(`Project: ${config.project}`);

  const browser = config.contracts.browser;
  if (browser) {
    const browserStatus = browser.enabled === false ? 'disabled' : 'enabled';
    console.log(
      `Browser contract: ${browserStatus}, ${formatCount(browser.routes.length, 'route')}, ${formatCount(
        browser.visualSmoke.length,
        'visual smoke case'
      )}`
    );
    console.log(`Base URL: ${browser.baseUrl}`);
    printRouteDetails(browser);

    if (browser.server) {
      console.log(
        `Server: configured, readyUrl ${browser.server.readyUrl}, reuseExisting ${browser.server.reuseExisting}, timeoutMs ${browser.server.timeoutMs}`
      );
      console.log(`Server reachability: ${serverReachability ?? 'not checked; doctor does not start servers'}`);
    } else {
      console.log('Server: not configured; doctor will not start a server');
    }
  } else {
    console.log('Browser contract: not configured');
  }

  const design = config.contracts.design;
  console.log(
    design
      ? `Design contract: ${design.enabled === false ? 'disabled' : 'enabled'}, ${formatCount(design.commands.length, 'command')}`
      : 'Design contract: not configured'
  );

  const component = config.contracts.component;
  if (component) {
    const runtime = describeComponentRuntime(component);
    console.log(`Component contract: ${component.enabled === false ? 'disabled' : 'enabled'}, ${formatCount(component.cases.length, 'case')}, runtime ${runtime}`);
    if (component.portal) {
      console.log(`Component portal: readyUrl ${component.portal.readyUrl}, reuseExisting ${component.portal.reuseExisting}, timeoutMs ${component.portal.timeoutMs}`);
    }
  } else {
    console.log('Component contract: not configured');
  }

  const print = config.contracts.print;
  console.log(
    print
      ? `Print contract: ${print.enabled === false ? 'disabled' : 'enabled'}, ${formatCount(print.cases.length, 'case')}`
      : 'Print contract: not configured'
  );

  console.log(`Lifecycle beforeRun: ${formatCount(config.lifecycle.beforeRun.length, 'hook')}`);
}

type DoctorBrowserConfig = NonNullable<ReflectionConfig['contracts']['browser']>;

function printRouteDetails(browser: DoctorBrowserConfig): void {
  printNetworkSummary('Browser', browser.setup?.network);
  printContextSetup('Browser', browser.setup);

  for (const route of browser.routes) {
    const described = route.viewports.map((viewport) =>
      isCustomRouteViewport(viewport) ? `${getRouteViewportName(viewport)} (${viewport.width}x${viewport.height})` : viewport
    );
    console.log(`Route ${route.id} viewports: ${described.join(', ')}`);

    if (route.states) {
      const states = route.states.map((state) => `${state.id} (${formatCount(state.steps.length, 'step')})`);
      console.log(`Route ${route.id} states: ${states.join(', ')}`);
    }

    printNetworkSummary(`Route ${route.id}`, route.setup?.network);
    printContextSetup(`Route ${route.id}`, route.setup);
  }
}

function printNetworkSummary(label: string, network: NonNullable<DoctorBrowserConfig['setup']>['network']): void {
  if (!network) {
    return;
  }

  console.log(`${label} network: ${formatCount(network.stubs.length, 'stub')}, unmatched ${network.unmatched}`);
  for (const stub of network.stubs) {
    const source = stub.json !== undefined ? 'json' : stub.file !== undefined ? `file ${stub.file}` : stub.body !== undefined ? 'body' : 'empty';
    console.log(`  ${stub.method ?? 'ANY'} ${stub.url} -> ${stub.status} (${source}${stub.once ? ', once' : ''}${stub.delayMs ? `, ${stub.delayMs}ms delay` : ''})`);
  }
}

function printContextSetup(label: string, setup: DoctorBrowserConfig['setup']): void {
  if (!setup) {
    return;
  }

  const parts = [
    setup.clock ? `clock ${setup.clock.now}` : undefined,
    setup.timezone ? `timezone ${setup.timezone}` : undefined,
    setup.locale ? `locale ${setup.locale}` : undefined,
    setup.colorScheme ? `colorScheme ${setup.colorScheme}` : undefined,
    setup.reducedMotion ? `reducedMotion ${setup.reducedMotion}` : undefined
  ].filter((part): part is string => part !== undefined);

  if (parts.length > 0) {
    console.log(`${label} environment: ${parts.join(', ')}`);
  }
}

function describeComponentRuntime(component: NonNullable<ReflectionConfig['contracts']['component']>): 'storybook' | 'portal' | 'mixed' | 'none' {
  const hasStorybookCases = component.cases.some((visualCase) => Boolean(visualCase.storyId));
  const hasPortalCases = component.cases.some((visualCase) => Boolean(visualCase.path));

  if (hasStorybookCases && hasPortalCases) {
    return 'mixed';
  }

  if (hasPortalCases) {
    return 'portal';
  }

  if (hasStorybookCases) {
    return 'storybook';
  }

  return 'none';
}

async function checkConfiguredServerReachability(config: ReflectionConfig): Promise<string | undefined> {
  const readyUrl = config.contracts.browser?.server?.readyUrl;
  if (!readyUrl) {
    return undefined;
  }

  try {
    const response = await fetch(readyUrl, { cache: 'no-store' });
    await response.body?.cancel();
    return response.status >= 200 && response.status < 500 ? `reachable (${response.status})` : `unreachable (${response.status})`;
  } catch {
    return 'unreachable';
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function formatCount(count: number, label: string): string {
  return `${count} ${label}${count === 1 ? '' : 's'}`;
}
