import { CommanderError } from 'commander';
import { collectGarbage, type GcPlan } from '../core/gc.js';
import { ExitCode } from '../core/exit-codes.js';

export type GcCommandOptions = {
  reportDir?: string;
  dryRun?: boolean;
  delete?: boolean;
};

export async function gcCommand(options: GcCommandOptions = {}): Promise<void> {
  try {
    if (options.dryRun === true && options.delete === true) {
      throw new CommanderError(ExitCode.InvalidUsage, 'reflection.gc', 'Use either --dry-run or --delete, not both.');
    }

    const plan = await collectGarbage({ ...(options.reportDir !== undefined ? { reportDir: options.reportDir } : {}), dryRun: options.delete !== true });
    console.log(renderGcSummary(plan));
  } catch (error) {
    if (error instanceof CommanderError) {
      throw error;
    }

    const message = error instanceof Error ? error.message : String(error);
    throw new CommanderError(ExitCode.ToolOrConfigError, 'reflection.gc', message);
  }
}

export function renderGcSummary(plan: GcPlan): string {
  const lines = ['Reflection GC', '', `Dry run: ${plan.dryRun ? 'yes' : 'no'}`, `Runs directory: ${plan.runsDir}`, ''];

  if (plan.eligible.length === 0) {
    lines.push(plan.dryRun ? 'No eligible run directories would be deleted.' : 'No eligible run directories were deleted.');
  } else {
    lines.push(plan.dryRun ? 'Would delete:' : 'Eligible:');
    for (const run of plan.eligible) {
      lines.push(`- ${run.runId}: ${run.path}`);
    }
  }

  if (plan.deleted.length > 0) {
    lines.push('', 'Deleted:');
    for (const run of plan.deleted) {
      lines.push(`- ${run.runId}: ${run.path}`);
    }
  }

  if (plan.skipped.length > 0) {
    lines.push('', 'Skipped:');
    for (const run of plan.skipped) {
      lines.push(`- ${run.runId}: ${run.reason}`);
    }
  }

  return lines.join('\n');
}
