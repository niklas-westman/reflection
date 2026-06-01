import type { ArtifactStore } from '../../core/artifact-store.js';
import type { CheckResult } from '../../core/report-schema.js';
import { runDesignCommand, type DesignCommandConfig } from './command-adapter.js';

export type DesignContractConfig = {
  enabled?: boolean | undefined;
  commands?: DesignCommandConfig[] | undefined;
};

export async function runDesignContract(config: DesignContractConfig | undefined, store: ArtifactStore): Promise<CheckResult[]> {
  if (!config || config.enabled === false) {
    return [];
  }

  const commands = config.commands ?? [];
  const checks: CheckResult[] = [];

  for (const command of commands) {
    const result = await runDesignCommand(command, store);
    const passed = result.exitCode === 0;
    const blocking = command.blocking ?? true;
    const status: CheckResult['status'] = passed ? 'pass' : blocking ? 'fail' : 'warn';
    const severity: CheckResult['severity'] = blocking ? 'blocking' : 'review';

    checks.push({
      id: `design.${command.id}`,
      suite: 'design',
      target: command.id,
      status,
      severity,
      summary: passed
        ? `Design token/source contract command "${command.id}" passed.`
        : `Design token/source contract command "${command.id}" exited ${result.exitCode ?? `with signal ${result.signal}`}.`,
      details: summarizeOutput(result.stdout, result.stderr),
      artifacts: [result.artifact],
      metadata: {
        command: command.command,
        cwd: command.cwd ?? process.cwd(),
        exitCode: result.exitCode,
        signal: result.signal,
        classification: 'token-source-contract'
      },
      suggestedNextStep: passed ? undefined : 'Review the full command log artifact and update the token/source contract or implementation.'
    });
  }

  return checks;
}

function summarizeOutput(stdout: string, stderr: string): string {
  const output = `${stdout}\n${stderr}`.trim();
  if (!output) {
    return 'No command output.';
  }

  const lines = output.split(/\r?\n/).filter(Boolean);
  return lines.slice(0, 6).join('\n');
}
