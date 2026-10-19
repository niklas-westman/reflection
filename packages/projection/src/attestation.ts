import { z } from 'zod';

// Who made a statement. `human`: a person recorded it. `delegated`: a person gave it in conversation and an
// agent wrote it down; it counts as the person's. `agent`: an agent or script recorded it with no person behind it.
export const attestationSchema = z.enum(['human', 'delegated', 'agent']);
export type Attestation = z.output<typeof attestationSchema>;

// A delegated record names the person (`by`), the agent that wrote it down (`recordedBy`), and keeps the
// person's words (`words`, the field that holds them) so anyone can check what was given.
export function addDelegationIssues(
  record: { by?: string | undefined; recordedBy?: string | undefined },
  words: { path: string; value: string | undefined },
  context: z.RefinementCtx
): void {
  if (!record.by) {
    context.addIssue({ code: 'custom', path: ['by'], message: 'a delegated record must name the person who gave it' });
  }
  if (!record.recordedBy) {
    context.addIssue({ code: 'custom', path: ['recordedBy'], message: 'a delegated record must name the agent that wrote it down' });
  }
  if (!words.value?.trim()) {
    context.addIssue({ code: 'custom', path: [words.path], message: `a delegated record must keep the person's words in ${words.path}` });
  }
}
