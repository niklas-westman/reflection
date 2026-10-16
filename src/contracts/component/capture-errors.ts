export type CaptureErrorClassification = 'capture-state-not-established' | 'capture-stabilization-failed';

// Raised when a declared capture policy cannot be honoured. The case fails explicitly; nothing is captured as a substitute.
export class CaptureStateError extends Error {
  readonly code: string;
  readonly classification: CaptureErrorClassification;
  readonly evidence: Record<string, unknown>;

  constructor(classification: CaptureErrorClassification, code: string, message: string, evidence: Record<string, unknown> = {}) {
    super(message);
    this.name = 'CaptureStateError';
    this.classification = classification;
    this.code = code;
    this.evidence = evidence;
  }
}
