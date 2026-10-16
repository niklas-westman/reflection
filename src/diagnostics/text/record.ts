export const textDiagnosticsRecordSchemaId = 'reflection.text-diagnostics/v1';

export const textDiagnosticsStatement =
  'Diagnostic only. This record does not change the native screenshot outcome, grant compliance, or stand in for owner approval.';

export type TextDiagnosticsState = 'available' | 'not-configured' | 'unsupported' | 'invalid' | 'error';

export type ComparisonOutcome = 'match' | 'mismatch' | 'unknown';

export type FactBasis = 'provided' | 'observed' | 'inferred' | 'computed-style' | 'cdp-platform-fonts' | 'unavailable';

export interface RecordReason {
  code: string;
  message: string;
  path?: string;
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Observation {
  field: string;
  source: unknown;
  runtime: unknown;
  delta: number | null;
  unit: string | null;
  tolerance: number | null;
  comparison: ComparisonOutcome;
  sourceBasis: FactBasis;
  runtimeBasis: FactBasis;
  note?: string | undefined;
  // Additive, optional detail for consumers that want it: a graded classification and the evidence behind it.
  classification?: string | undefined;
  detail?: Record<string, unknown> | undefined;
}

export interface PlatformFont {
  familyName: string;
  postScriptName: string | null;
  isCustomFont: boolean;
  glyphCount: number;
}

export interface PartRuntime {
  selector: string;
  matchCount: number;
  actualText: string | null;
  element: { tagName: string; role: string | null; ariaLabel: string | null; ariaSnapshot: string | null } | null;
  typography: Record<string, string | number | null> | null;
  geometry: {
    elementBounds: Box;
    textBounds: Box | null;
    baseline: { y: number; method: 'inline-block-probe'; basis: 'observed' } | null;
    transforms: Array<{ element: string; matrix: string }>;
  } | null;
  platformFonts: PlatformFont[] | null;
  platformFontsMethod: 'CSS.getPlatformFontsForNode' | 'unavailable';
}

export interface RuntimePageRecord {
  url: string;
  viewport: { width: number; height: number };
  devicePixelRatio: number;
  fontsStatus: string;
  fontFaces: Array<{ family: string; weight: string; style: string; stretch: string; status: string }>;
  // Hashes are of the font files the page downloaded. Which downloaded file painted the text is not established.
  fontResponses: Array<{ url: string; status: number; bytes: number | null; sha256: string | null }>;
}

export interface PartRecord {
  id: string;
  expectedText: string;
  runtime: PartRuntime | null;
  observations: Observation[];
  evidence: { complete: boolean; missing: string[] };
}

export interface ExperimentMeasurement {
  totalDiffPixels: number;
  regionDiffPixels: number;
  outsideRegionDiffPixels: number;
  totalPixels: number;
  regionPixels: number;
  region: Box;
  regionUnit: 'device-pixels';
}

export interface ExperimentRecord {
  id: string;
  kind: 'frame-render' | 'part-overlay';
  partId?: string;
  state: 'available' | 'skipped' | 'unsupported' | 'error';
  description: string;
  reason?: string;
  render?: { path: string; sha256: string; bytes: number };
  diff?: { path: string; sha256: string; bytes: number };
  measurement?: ExperimentMeasurement;
  nativeMeasurement?: ExperimentMeasurement;
}

export type RecordArtifactRole =
  | 'reference-image'
  | 'implementation-screenshot'
  | 'native-diff'
  | 'source-outline'
  | 'diagnostic-render'
  | 'comparison-image'
  | 'metadata';

export interface RecordArtifact {
  role: RecordArtifactRole;
  path: string;
  sha256: string;
  bytes: number;
  mediaType: string;
  note?: string;
}

export type InferenceId =
  | 'native-text-vector-rendering-discrepancy-suspected'
  | 'typography-or-geometry-mismatch-observed'
  | 'font-identity-mismatch-observed'
  | 'native-screenshot-passed'
  | 'insufficient-evidence';

export interface Inference {
  id: InferenceId;
  confidence: 'none' | 'low' | 'moderate';
  summary: string;
  supportedBy: string[];
  limitations: string[];
}

export interface NativeOutcome {
  status: string;
  classification: string;
  diffPixels: number;
  diffRatio: number;
  threshold: unknown;
  unchanged: true;
}

export interface TextDiagnosticsInputs {
  bundleSha256: string;
  referenceSha256: string;
  referenceBinding: 'identical-bytes' | 'identical-pixels';
  baselineSha256: string;
  actualSha256: string;
  outlines: Array<{ id: string; sha256: string }>;
  parts: Array<{ id: string; selector: string }>;
  context: Record<string, string>;
  viewport: { width: number; height: number; deviceScaleFactor: number };
  tool: { reflectionVersion: string; playwrightVersion: string; browser: { name: string; version: string } | null; platform: string; arch: string };
  // Hash over every input above plus run identity. A different bindingKey means earlier diagnostics no longer describe this comparison.
  bindingKey: string;
}

export interface TextDiagnosticsRecord {
  schema: typeof textDiagnosticsRecordSchemaId;
  state: TextDiagnosticsState;
  statement: typeof textDiagnosticsStatement;
  runId: string;
  caseId: string;
  reasons: RecordReason[];
  nativeOutcome: NativeOutcome;
  source: {
    id: string;
    scope: 'pinned' | 'live-diagnostic';
    sourceVersion: string | null;
    document: { id: string | null; name?: string | undefined };
    fileIdentity: { reportedId: string | null; attestedId: string | null; verification: 'reported' | 'caller-attested' | 'unknown' };
    capturedAt: string;
    receipt?: { id: string; kind: string };
    provider?: string;
  } | null;
  inputs: TextDiagnosticsInputs | null;
  runtime: RuntimePageRecord | null;
  parts: PartRecord[];
  experiments: ExperimentRecord[];
  inference: Inference | null;
  artifacts: RecordArtifact[];
  conversions: Array<{ field: string; operation: string; exact: boolean }>;
  limitations: string[];
  shaping: { state: 'unsupported'; reason: string };
}

export const fixedLimitations = [
  'Typography observations compare independently supplied facts with one browser on one platform; they do not prove font-binary identity.',
  'A rendering-path experiment explains where differing pixels can come from. It is not implementation proof and never replaces the real screenshot.',
  'Region measurements describe where differing pixels fall; they do not mask any pixels out of the native comparison.'
];

export const shapingUnsupported = {
  state: 'unsupported' as const,
  reason: 'Full-string shaping and per-glyph outline comparison are not part of this release. No glyph-level similarity is reported.'
};
