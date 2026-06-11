import { access } from 'node:fs/promises';
import { CommanderError } from 'commander';
import { loadReflectionConfig, type ReflectionConfig } from '../core/config.js';
import { ExitCode } from '../core/exit-codes.js';

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
  console.log(
    component
      ? `Component contract: ${component.enabled === false ? 'disabled' : 'enabled'}, ${formatCount(component.cases.length, 'case')}`
      : 'Component contract: not configured'
  );
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
