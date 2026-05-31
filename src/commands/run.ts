import { CommanderError } from 'commander';
import { isRunMode, loadReflectionConfig, type RunMode } from '../core/config.js';
import { ExitCode } from '../core/exit-codes.js';

export type RunCommandOptions = {
  config?: string;
  mode: string;
  ci?: boolean;
};

export function parseRunMode(value: string): RunMode {
  if (!isRunMode(value)) {
    throw new CommanderError(
      ExitCode.InvalidUsage,
      'reflection.invalidMode',
      `Invalid mode "${value}". Expected one of: smoke, design, visual, full.`
    );
  }

  return value;
}

export async function runCommand(options: RunCommandOptions): Promise<void> {
  let mode: RunMode;
  try {
    mode = parseRunMode(options.mode);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    throw error;
  }

  if (options.config) {
    try {
      await loadReflectionConfig(options.config);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(message);
      throw new CommanderError(ExitCode.ToolOrConfigError, 'reflection.config', message);
    }
  }

  console.log('Reflection');
  console.log('');
  console.log(`Mode: ${mode}`);
  console.log(`CI: ${options.ci === true ? 'yes' : 'no'}`);
  console.log('Phase 1.1 CLI/config foundation is ready. Browser contract execution begins in Phase 1.2/1.5.');
}
