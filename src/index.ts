export { defineReflection } from './core/define-reflection.js';
export type { ReflectionConfig, ReflectionConfigInput, RunMode } from './core/config.js';
export type { CheckDiagnostic, DiagnosticEvidence, FailureClass, ReflectionReport, ReportInput, ResultHash } from './core/report-schema.js';
// Providers that read reports hash their current inputs and results with the same code the engine used.
export { hashReportInputs } from './core/input-hashing.js';
export type { DeclaredInput, HashInputsOptions } from './core/input-hashing.js';
export { computeResultHash } from './core/result-hash.js';
export type { ComputedResultHash } from './core/result-hash.js';
export type {
  ReflectionPortalCleanup,
  ReflectionPortalFraming,
  ReflectionPortalMount,
  ReflectionPortalMountInput,
  ReflectionPortalMountResult
} from './contracts/component/portal-entry.js';
