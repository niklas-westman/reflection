import { z } from 'zod';

export const proofLayerSchema = z.enum(['integrity', 'structural', 'visual', 'behavior']);
export type ProofLayer = z.output<typeof proofLayerSchema>;

export const proofOutcomeSchema = z.enum(['passed', 'failed', 'not-run', 'unsupported']);
export type ProofOutcome = z.output<typeof proofOutcomeSchema>;

// Proof per layer. A layer the provider has no concept of is simply absent. Coverage never appears here.
export const proofSchema = z.object({
  integrity: proofOutcomeSchema.optional(),
  structural: proofOutcomeSchema.optional(),
  visual: proofOutcomeSchema.optional(),
  behavior: proofOutcomeSchema.optional()
});
export type Proof = z.output<typeof proofSchema>;
