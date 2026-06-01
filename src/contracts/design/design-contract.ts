import type { ArtifactStore } from '../../core/artifact-store.js';
import { CheckSeveritySchema, CheckStatusSchema, type CheckResult } from '../../core/report-schema.js';
import { runDesignCommand, type DesignCommandConfig, type DesignCommandResult } from './command-adapter.js';
import { z } from 'zod';

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
    checks.push(...normalizeDesignCommandResult(result));
  }

  return checks;
}

const StructuredDesignCheckSchema = z.object({
  id: z.string().min(1),
  family: z.string().min(1).optional(),
  target: z.string().min(1),
  status: CheckStatusSchema,
  severity: CheckSeveritySchema.optional(),
  summary: z.string().min(1),
  details: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional()
});

const StructuredDesignOutputSchema = z.object({
  reflection: z.literal('design-checks-v1'),
  checks: z.array(StructuredDesignCheckSchema).min(1)
});

function normalizeDesignCommandResult(result: DesignCommandResult): CheckResult[] {
  const structured = parseStructuredDesignOutput(result.stdout);
  if (structured) {
    const checks = structured.checks.map((check) => normalizeStructuredDesignCheck(check, result));
    const commandFailure = normalizeStructuredCommandFailure(result);
    return commandFailure ? [...checks, commandFailure] : checks;
  }

  return [normalizeGlobalDesignCheck(result)];
}

function normalizeStructuredDesignCheck(
  check: z.output<typeof StructuredDesignCheckSchema>,
  result: DesignCommandResult
): CheckResult {
  const severity = check.severity ?? defaultDesignSeverity(check.status, result.command.blocking ?? true);
  return {
    id: `design.${stripDesignPrefix(check.id)}`,
    suite: 'design',
    target: check.target,
    status: check.status,
    severity,
    summary: check.summary,
    details: check.details,
    artifacts: [result.artifact],
    metadata: {
      ...(check.metadata ?? {}),
      ...(check.family ? { family: check.family } : {}),
      commandId: result.command.id,
      command: result.command.command,
      cwd: result.command.cwd ?? process.cwd(),
      exitCode: result.exitCode,
      signal: result.signal,
      classification: 'token-source-contract'
    },
    suggestedNextStep:
      check.status === 'pass' || check.status === 'skipped'
        ? undefined
        : 'Review the full command log artifact and update the token/source contract or implementation.'
  };
}

function normalizeStructuredCommandFailure(result: DesignCommandResult): CheckResult | undefined {
  if (result.exitCode === 0 && !result.signal) {
    return undefined;
  }

  const blocking = result.command.blocking ?? true;
  const status: CheckResult['status'] = blocking ? 'fail' : 'warn';
  const severity: CheckResult['severity'] = blocking ? 'blocking' : 'review';

  return {
    id: `design.${result.command.id}.command`,
    suite: 'design',
    target: result.command.id,
    status,
    severity,
    summary: `Design token/source contract command "${result.command.id}" exited ${result.exitCode ?? `with signal ${result.signal}`}.`,
    details: summarizeOutput(result.stdout, result.stderr),
    artifacts: [result.artifact],
    metadata: {
      command: result.command.command,
      cwd: result.command.cwd ?? process.cwd(),
      exitCode: result.exitCode,
      signal: result.signal,
      classification: 'token-source-contract',
      structuredOutput: true
    },
    suggestedNextStep: 'Review the full command log artifact and fix the validator command failure.'
  };
}

function normalizeGlobalDesignCheck(result: DesignCommandResult): CheckResult {
  const passed = result.exitCode === 0;
  const blocking = result.command.blocking ?? true;
  const status: CheckResult['status'] = passed ? 'pass' : blocking ? 'fail' : 'warn';
  const severity: CheckResult['severity'] = blocking ? 'blocking' : 'review';

  return {
    id: `design.${result.command.id}`,
    suite: 'design',
    target: result.command.id,
    status,
    severity,
    summary: passed
      ? `Design token/source contract command "${result.command.id}" passed.`
      : `Design token/source contract command "${result.command.id}" exited ${result.exitCode ?? `with signal ${result.signal}`}.`,
    details: summarizeOutput(result.stdout, result.stderr),
    artifacts: [result.artifact],
    metadata: {
      command: result.command.command,
      cwd: result.command.cwd ?? process.cwd(),
      exitCode: result.exitCode,
      signal: result.signal,
      classification: 'token-source-contract'
    },
    suggestedNextStep: passed ? undefined : 'Review the full command log artifact and update the token/source contract or implementation.'
  };
}

function defaultDesignSeverity(status: CheckResult['status'], blocking: boolean): CheckResult['severity'] {
  if (status === 'pass' || status === 'skipped') {
    return 'review';
  }

  return blocking ? 'blocking' : 'review';
}

function parseStructuredDesignOutput(stdout: string): z.output<typeof StructuredDesignOutputSchema> | undefined {
  const trimmed = stdout.trim();
  if (!trimmed) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    const result = StructuredDesignOutputSchema.safeParse(parsed);
    return result.success ? result.data : undefined;
  } catch {
    return undefined;
  }
}

function stripDesignPrefix(id: string): string {
  return id.startsWith('design.') ? id.slice('design.'.length) : id;
}

function summarizeOutput(stdout: string, stderr: string): string {
  const output = `${stdout}\n${stderr}`.trim();
  if (!output) {
    return 'No command output.';
  }

  const lines = output.split(/\r?\n/).filter(Boolean);
  return lines.slice(0, 6).join('\n');
}
