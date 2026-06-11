import { access } from 'node:fs/promises';
import { join } from 'node:path';
import { CommanderError } from 'commander';
import { ExitCode } from '../core/exit-codes.js';

export type InitCommandOptions = {
  dryRun?: boolean;
  preset?: string;
  cwd?: string;
};

const supportedPresets = ['vite-react'] as const;
type InitPreset = (typeof supportedPresets)[number];

export async function initCommand(options: InitCommandOptions = {}): Promise<void> {
  if (options.dryRun !== true) {
    throw new CommanderError(ExitCode.InvalidUsage, 'reflection.init', 'Use --dry-run to preview Reflection setup. This command does not write files yet.');
  }

  const preset = parsePreset(options.preset ?? 'vite-react');
  const cwd = options.cwd ?? process.cwd();
  const packageManager = await detectPackageManager(cwd);

  console.log(renderInitPlan({ packageManager, preset }));
}

function parsePreset(value: string): InitPreset {
  if (supportedPresets.includes(value as InitPreset)) {
    return value as InitPreset;
  }

  throw new CommanderError(
    ExitCode.InvalidUsage,
    'reflection.init',
    `Unsupported preset "${value}". Expected one of: ${supportedPresets.join(', ')}.`
  );
}

async function detectPackageManager(cwd: string): Promise<'pnpm' | 'npm' | 'yarn'> {
  if (await pathExists(join(cwd, 'pnpm-lock.yaml'))) {
    return 'pnpm';
  }

  if (await pathExists(join(cwd, 'yarn.lock'))) {
    return 'yarn';
  }

  return 'npm';
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function renderInitPlan(input: { packageManager: 'pnpm' | 'npm' | 'yarn'; preset: InitPreset }): string {
  const runPrefix = input.packageManager === 'npm' ? 'npx' : `${input.packageManager} exec`;
  const installCommand = input.packageManager === 'npm' ? 'npm install --save-dev reflection-check' : `${input.packageManager} add -D reflection-check`;

  return [
    'Reflection init',
    '',
    'Dry run: yes',
    `Preset: ${input.preset}`,
    `Package manager: ${input.packageManager}`,
    `Install: ${installCommand}`,
    '',
    'Would create: reflection.config.ts',
    'Would suggest script: "reflection": "reflection run --config reflection.config.ts --mode smoke"',
    '',
    'Suggested commands:',
    `- ${runPrefix} reflection doctor --config reflection.config.ts`,
    `- ${runPrefix} reflection run --config reflection.config.ts --mode smoke`,
    `- ${runPrefix} reflection review --json`
  ].join('\n');
}
