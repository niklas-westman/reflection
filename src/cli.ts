#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { Command, CommanderError } from 'commander';
import { doctorCommand } from './commands/doctor.js';
import { gcCommand } from './commands/gc.js';
import { reviewCommand } from './commands/review.js';
import { runCommand } from './commands/run.js';
import { updateCommand } from './commands/update.js';
import { ExitCode } from './core/exit-codes.js';

export function createCli(): Command {
  const program = new Command();

  program
    .name('reflection')
    .description('Evidence-backed rendered UI validation.')
    .version('0.0.0')
    .configureOutput({
      outputError: (message, write) => write(message)
    });

  program
    .command('run')
    .description('Check the UI contract for this project.')
    .option('--config <path>', 'Path to reflection.config.ts')
    .option('--mode <mode>', 'Run mode: smoke, design, visual, full', 'smoke')
    .option('--ci', 'Run with CI defaults')
    .option('--report-dir <path>', 'Artifact/report root directory')
    .option('--workers [count]', 'Worker count for browser/visual checks')
    .action(async (options: { config?: string; mode: string; ci?: boolean; reportDir?: string; workers?: string | boolean }) => {
      await runCommand(options);
    });

  program
    .command('review')
    .description('Show what passed, failed, changed visually, and where the evidence is.')
    .option('--latest', 'Review the latest run')
    .option('--run <runId>', 'Review a specific run id')
    .option('--json', 'Emit a stable JSON summary')
    .option('--report-dir <path>', 'Artifact/report root directory')
    .action(async (options: { latest?: boolean; run?: string; json?: boolean; reportDir?: string }) => {
      await reviewCommand(options);
    });

  program
    .command('update')
    .description('Accept intentional visual changes by updating targeted baselines.')
    .option('--config <path>', 'Path to reflection.config.ts')
    .option('--report-dir <path>', 'Artifact/report root directory')
    .option('--from-run <runId>', 'Run id to promote from, or latest', 'latest')
    .option('--route <routeId>', 'Update visual baselines for a specific route id')
    .option('--case <caseId>', 'Update a specific visual baseline case id')
    .option('--all', 'Update all visual baselines from the selected run')
    .option('--dry-run', 'Show planned baseline updates without writing')
    .option('--ci', 'Refuse updates under CI mode')
    .action(async (options: { config?: string; reportDir?: string; fromRun?: string; route?: string; case?: string; all?: boolean; dryRun?: boolean; ci?: boolean }) => {
      await updateCommand(options);
    });

  program
    .command('gc')
    .description('Clean up old Reflection run artifacts without touching baselines.')
    .option('--report-dir <path>', 'Artifact/report root directory')
    .option('--dry-run', 'List eligible run directories without deleting them')
    .option('--delete', 'Delete eligible run directories')
    .action(async (options: { reportDir?: string; dryRun?: boolean; delete?: boolean }) => {
      await gcCommand(options);
    });

  program
    .command('doctor')
    .description('Check whether Reflection can run correctly in this project.')
    .option('--config <path>', 'Path to reflection.config.ts')
    .action(async (options: { config?: string }) => {
      await doctorCommand(options);
    });

  return program;
}

async function main(): Promise<void> {
  const program = createCli();

  try {
    await program.parseAsync(process.argv);
  } catch (error) {
    if (error instanceof CommanderError) {
      if (error.message) {
        console.error(error.message);
      }
      process.exit(error.exitCode);
    }

    console.error(error instanceof Error ? error.message : String(error));
    process.exit(ExitCode.ToolOrConfigError);
  }
}

const executedPath = process.argv[1] ? fileURLToPath(import.meta.url) === process.argv[1] : false;

if (executedPath) {
  void main();
}
