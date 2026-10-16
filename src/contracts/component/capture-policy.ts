import { createHash } from 'node:crypto';
import { canonicalJson } from '../../core/canonical-json.js';

export const capturePolicyVersion = 1;

export type InteractionKind = 'hover' | 'focus' | 'pressed';

export interface CaptureInteractionConfig {
  kind: InteractionKind;
  selector: string;
  // Fractions of the target box where the pointer lands, for hover and pressed. Defaults to the centre.
  position?: { x: number; y: number } | undefined;
}

export interface LegacyAnimationStabilization {
  disableAnimations?: boolean | undefined;
  waitMs?: number | undefined;
}

export interface CaseStabilizationConfig {
  animations: 'none' | 'settle';
  settleMs?: number | undefined;
  verify?: boolean | undefined;
  verifyDelayMs?: number | undefined;
}

export type StabilizationMethod = 'css-none' | 'web-animations-settle' | 'wait-only';

export interface EffectiveStabilization {
  // case: the explicit per-case policy. browser-state: derived from browserState.animationStabilization, exactly as before.
  source: 'case' | 'browser-state';
  method: StabilizationMethod;
  settleMs: number;
  verify: boolean;
  verifyDelayMs: number;
}

export interface EffectiveInteraction {
  kind: InteractionKind;
  selector: string;
  position: { x: number; y: number };
}

export interface CapturePolicy {
  version: number;
  interaction: EffectiveInteraction | null;
  stabilization: EffectiveStabilization | null;
  // Hash of the effective policy. A different hash means earlier evidence was captured under a different policy.
  hash: string;
}

export interface CapturePolicySources {
  browserState?: { kind: InteractionKind; selector: string; position?: { x: number; y: number } | undefined; animationStabilization?: LegacyAnimationStabilization | undefined } | undefined;
  stabilization?: CaseStabilizationConfig | undefined;
}

export const defaultVerifyDelayMs = 100;

// Unconfigured cases return undefined so their results, metadata and artifacts stay exactly as before.
export function resolveCapturePolicy(sources: CapturePolicySources): CapturePolicy | undefined {
  const interaction = sources.browserState ? resolveInteraction(sources.browserState) : null;
  const stabilization = resolveStabilization(sources);
  if (!interaction && !stabilization) {
    return undefined;
  }

  const body = { version: capturePolicyVersion, interaction, stabilization };
  return { ...body, hash: createHash('sha256').update(canonicalJson(body)).digest('hex') };
}

function resolveInteraction(browserState: NonNullable<CapturePolicySources['browserState']>): EffectiveInteraction {
  return { kind: browserState.kind, selector: browserState.selector, position: browserState.position ?? { x: 0.5, y: 0.5 } };
}

function resolveStabilization(sources: CapturePolicySources): EffectiveStabilization | null {
  if (sources.stabilization) {
    const { animations, settleMs, verify, verifyDelayMs } = sources.stabilization;
    return {
      source: 'case',
      method: animations === 'settle' ? 'web-animations-settle' : 'css-none',
      settleMs: settleMs ?? 0,
      verify: verify ?? true,
      verifyDelayMs: verifyDelayMs ?? defaultVerifyDelayMs
    };
  }

  const legacy = sources.browserState?.animationStabilization;
  if (!legacy) {
    return null;
  }

  return {
    source: 'browser-state',
    method: legacy.disableAnimations !== false ? 'css-none' : 'wait-only',
    settleMs: legacy.waitMs ?? 0,
    verify: false,
    verifyDelayMs: defaultVerifyDelayMs
  };
}
