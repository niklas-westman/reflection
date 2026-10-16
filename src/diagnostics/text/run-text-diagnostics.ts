import { createHash } from 'node:crypto';
import { canonicalJson } from '../../core/canonical-json.js';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Browser } from 'playwright';
import type { ImageDiffResult } from '../../contracts/visual/image-diff.js';
import { decodeImageBytes } from '../../contracts/visual/image-io.js';
import type { ArtifactStore } from '../../core/artifact-store.js';
import { describeOperatingSystem, getPlaywrightVersion, getReflectionVersion } from '../../core/environment.js';
import type { ArtifactRef } from '../../core/report-schema.js';
import { buildPartRecord, inferCause } from './analysis.js';
import { loadTextSource, TextDiagnosticsInputError, type DiagnosticReason, type LoadedTextSource } from './bundle-loader.js';
import {
  runFrameRenderExperiment,
  runPartOverlayExperiment,
  type CaseSession,
  type ExperimentContext,
  type ExperimentResult
} from './experiments.js';
import {
  fixedLimitations,
  shapingUnsupported,
  textDiagnosticsRecordSchemaId,
  textDiagnosticsStatement,
  type Box,
  type ExperimentRecord,
  type NativeOutcome,
  type RecordArtifact,
  type TextDiagnosticsInputs,
  type TextDiagnosticsRecord,
  type TextDiagnosticsState
} from './record.js';
import { observePage } from './runtime-observation.js';
import { padRegion } from './region-measure.js';

export interface TextDiagnosticsCaseConfig {
  source: string;
  parts: Array<{ id: string; selector: string }>;
  context?: Record<string, string> | undefined;
  regionPadding?: number | undefined;
  experiments?: { frameRender?: boolean | undefined; partOverlay?: boolean | undefined } | undefined;
}

export interface RunTextDiagnosticsInput {
  config: TextDiagnosticsCaseConfig;
  configDir: string;
  runId: string;
  caseId: string;
  baselinePath: string;
  native: ImageDiffResult;
  expectedArtifact: ArtifactRef;
  actualArtifact: ArtifactRef;
  diffArtifact?: ArtifactRef | undefined;
  caseViewport: { width: number; height: number };
  browser: Browser;
  openCaseSession: () => Promise<CaseSession>;
  // The effective capture policy and what the native capture established. Diagnostic sessions apply the same policy.
  capture?: { policy: { hash: string }; nativeOutcome: unknown } | undefined;
  store: ArtifactStore;
  artifactBase: string;
}

export interface RunTextDiagnosticsResult {
  record: TextDiagnosticsRecord;
  artifacts: ArtifactRef[];
}

const caseDeviceScaleFactor = 1;

// Never throws: diagnostics are optional evidence and must not change the native outcome or abort later cases.
export async function runTextDiagnostics(input: RunTextDiagnosticsInput): Promise<RunTextDiagnosticsResult> {
  const native = describeNativeOutcome(input.native);
  try {
    return await runChecked(input, native);
  } catch (error) {
    if (error instanceof TextDiagnosticsInputError) {
      return rejected(input, native, error.state, error.reasons);
    }
    return rejected(input, native, 'error', [{ code: 'diagnostics-error', message: error instanceof Error ? error.message : String(error) }]);
  }
}

async function runChecked(input: RunTextDiagnosticsInput, native: NativeOutcome): Promise<RunTextDiagnosticsResult> {
  const loaded = await loadTextSource(resolve(input.configDir, input.config.source));
  const reasons = validateBinding(input, loaded);
  const referenceBinding = await bindReference(input, loaded, reasons);
  if (reasons.length > 0 || !referenceBinding) {
    return rejected(input, native, 'invalid', reasons, loaded);
  }

  const reference = (await decodeImageBytes(loaded.reference.bytes, loaded.bundle.reference.path)).image;
  const actual = (await decodeImageBytes(await readFile(input.store.resolveRunPath(input.actualArtifact.path)), input.actualArtifact.path)).image;
  const experimentContext: ExperimentContext = {
    browser: input.browser,
    openCaseSession: input.openCaseSession,
    store: input.store,
    artifactBase: input.artifactBase,
    reference,
    actual,
    deviceScaleFactor: loaded.bundle.viewport.deviceScaleFactor,
    viewport: input.caseViewport
  };

  const observed = await observeParts(input);
  const partRecords = input.config.parts.map((configured) => {
    const part = loaded.bundle.parts.find((candidate) => candidate.id === configured.id);
    if (!part) {
      throw new Error(`Unknown text part ${configured.id}.`);
    }
    return buildPartRecord(part, observed.parts.get(configured.id) ?? null, observed.page);
  });

  const experiments = await runExperiments(input, loaded, experimentContext);
  const outlineArtifacts = await writeSourceOutlines(input, loaded);
  const inputs = createInputs(input, loaded, referenceBinding, observed.browser);
  const experimentArtifacts = experiments.flatMap((experiment) => experiment.artifacts);
  const artifacts = [
    ...referencedCheckArtifacts(input),
    ...outlineArtifacts,
    ...experimentArtifacts
  ];
  const experimentRecords = experiments.map((experiment) => experiment.record);
  const inference = inferCause({ native, parts: partRecords, experiments: experimentRecords, source: loaded.bundle.source });

  const record: TextDiagnosticsRecord = {
    schema: textDiagnosticsRecordSchemaId,
    state: 'available',
    statement: textDiagnosticsStatement,
    runId: input.runId,
    caseId: input.caseId,
    reasons: [],
    nativeOutcome: native,
    source: describeSource(loaded),
    inputs,
    runtime: { ...observed.page, capture: describeCapture(input, observed.sessionCapture) },
    parts: partRecords,
    experiments: experimentRecords,
    inference,
    artifacts,
    conversions: describeConversions(loaded, input),
    limitations: [...fixedLimitations],
    shaping: shapingUnsupported
  };
  return finalize(input, record, [...outlineArtifacts, ...experimentArtifacts]);
}

function validateBinding(input: RunTextDiagnosticsInput, loaded: LoadedTextSource): DiagnosticReason[] {
  const reasons: DiagnosticReason[] = [];
  const bundle = loaded.bundle;

  for (const [key, expected] of Object.entries(input.config.context ?? {})) {
    if (bundle.context[key] !== expected) {
      reasons.push({
        code: 'context-mismatch',
        message: `The bundle's context "${key}" is ${JSON.stringify(bundle.context[key] ?? null)} but this comparison requires ${JSON.stringify(expected)}; it describes a different adapter, theme or stage.`
      });
    }
  }

  const known = new Set(bundle.parts.map((part) => part.id));
  for (const configured of input.config.parts) {
    if (!known.has(configured.id)) {
      reasons.push({ code: 'unknown-part', message: `Text part "${configured.id}" is not in the source bundle.` });
    }
  }

  if (bundle.viewport.width !== input.caseViewport.width || bundle.viewport.height !== input.caseViewport.height) {
    reasons.push({
      code: 'viewport-mismatch',
      message: `The bundle describes a ${bundle.viewport.width}x${bundle.viewport.height} viewport but the case renders at ${input.caseViewport.width}x${input.caseViewport.height}.`
    });
  }

  if (bundle.viewport.deviceScaleFactor !== caseDeviceScaleFactor) {
    reasons.push({
      code: 'dpr-mismatch',
      message: `The bundle describes device scale ${bundle.viewport.deviceScaleFactor} but Reflection captures component cases at ${caseDeviceScaleFactor}.`
    });
  }

  return reasons;
}

async function bindReference(input: RunTextDiagnosticsInput, loaded: LoadedTextSource, reasons: DiagnosticReason[]): Promise<'identical-bytes' | 'identical-pixels' | undefined> {
  const baselineBytes = await readFile(input.baselinePath);
  if (sha256(baselineBytes) === loaded.bundle.reference.sha256) {
    return 'identical-bytes';
  }

  const [baseline, reference] = await Promise.all([decodeImageBytes(baselineBytes, input.baselinePath), decodeImageBytes(loaded.reference.bytes, loaded.bundle.reference.path)]);
  const samePixels = baseline.image.width === reference.image.width && baseline.image.height === reference.image.height && baseline.image.data.equals(reference.image.data);
  if (samePixels) {
    return 'identical-pixels';
  }

  reasons.push({
    code: 'reference-differs-from-baseline',
    message: 'The bundle reference is not the image this comparison uses as its baseline, so the diagnostic would describe a different oracle.'
  });
  return undefined;
}

async function observeParts(input: RunTextDiagnosticsInput) {
  const session = await input.openCaseSession();
  try {
    const observed = await observePage({ page: session.page, context: session.context, parts: input.config.parts, fontResponses: session.fontResponses });
    return {
      parts: observed.parts,
      page: observed.page,
      sessionCapture: session.capture ?? null,
      browser: { name: input.browser.browserType().name(), version: input.browser.version() }
    };
  } finally {
    await session.close().catch(() => undefined);
  }
}

async function runExperiments(input: RunTextDiagnosticsInput, loaded: LoadedTextSource, context: ExperimentContext): Promise<ExperimentResult[]> {
  const padding = input.config.regionPadding ?? 2;
  const regions: Box[] = input.config.parts.map((configured) => {
    const part = loaded.bundle.parts.find((candidate) => candidate.id === configured.id);
    return padRegion(part ? part.box : { x: 0, y: 0, width: 0, height: 0 }, padding);
  });
  const results: ExperimentResult[] = [];
  const wantFrame = input.config.experiments?.frameRender !== false;
  const wantOverlay = input.config.experiments?.partOverlay !== false;

  if (wantFrame) {
    const frame = loaded.outlines.find((outline) => outline.artifact.kind === 'frame');
    results.push(
      frame
        ? await runFrameRenderExperiment(context, frame, regions)
        : skipped('frame-render', 'frame-render', 'No frame-level outlined source was supplied.')
    );
  }

  if (wantOverlay) {
    for (const configured of input.config.parts) {
      const outline = loaded.outlines.find((candidate) => candidate.artifact.kind === 'text-outline' && candidate.artifact.partIds?.includes(configured.id));
      const index = input.config.parts.findIndex((candidate) => candidate.id === configured.id);
      results.push(
        outline
          ? await runPartOverlayExperiment(context, outline, configured.id, configured.selector, [regions[index] as Box])
          : skipped(`part-overlay:${configured.id}`, 'part-overlay', `No text outline was supplied for part ${configured.id}.`, configured.id)
      );
    }
  }

  return results;
}

function skipped(id: string, kind: ExperimentRecord['kind'], reason: string, partId?: string): ExperimentResult {
  return { record: { id, kind, ...(partId ? { partId } : {}), state: 'skipped', description: 'Not run.', reason }, artifacts: [] };
}

async function writeSourceOutlines(input: RunTextDiagnosticsInput, loaded: LoadedTextSource): Promise<RecordArtifact[]> {
  const artifacts: RecordArtifact[] = [];
  for (const outline of loaded.outlines) {
    const path = `${input.artifactBase}/text-diagnostics/source-${outline.artifact.id}.svg`;
    await input.store.writeBuffer(path, outline.bytes);
    artifacts.push({
      role: 'source-outline',
      path,
      sha256: outline.artifact.sha256,
      bytes: outline.bytes.length,
      mediaType: 'image/svg+xml',
      note: `Validated copy of ${outline.artifact.kind} outline ${outline.artifact.id}; shown only as an image.`
    });
  }
  return artifacts;
}

function referencedCheckArtifacts(input: RunTextDiagnosticsInput): RecordArtifact[] {
  const entries: Array<[RecordArtifact['role'], ArtifactRef | undefined]> = [
    ['reference-image', input.expectedArtifact],
    ['implementation-screenshot', input.actualArtifact],
    ['native-diff', input.diffArtifact]
  ];
  return entries.flatMap(([role, artifact]) =>
    artifact ? [{ role, path: artifact.path, sha256: artifact.sha256 ?? '', bytes: artifact.bytes ?? 0, mediaType: 'image/png' }] : []
  );
}

function createInputs(
  input: RunTextDiagnosticsInput,
  loaded: LoadedTextSource,
  referenceBinding: 'identical-bytes' | 'identical-pixels',
  browser: { name: string; version: string }
): TextDiagnosticsInputs {
  const withoutKey = {
    capture: input.capture ? { policy: input.capture.policy, policyHash: input.capture.policy.hash } : null,
    bundleSha256: loaded.bundleSha256,
    referenceSha256: loaded.bundle.reference.sha256,
    referenceBinding,
    baselineSha256: input.expectedArtifact.sha256 ?? '',
    actualSha256: input.actualArtifact.sha256 ?? '',
    outlines: loaded.outlines.map((outline) => ({ id: outline.artifact.id, sha256: outline.artifact.sha256 })),
    parts: input.config.parts.map((part) => ({ id: part.id, selector: part.selector })),
    context: input.config.context ?? {},
    viewport: loaded.bundle.viewport,
    tool: {
      reflectionVersion: getReflectionVersion(),
      playwrightVersion: getPlaywrightVersion(),
      browser,
      platform: describeOperatingSystem().platform,
      arch: describeOperatingSystem().arch
    }
  };
  return { ...withoutKey, bindingKey: sha256(canonicalJson({ runId: input.runId, caseId: input.caseId, ...withoutKey })) };
}

function describeCapture(input: RunTextDiagnosticsInput, sessionOutcome: unknown): NonNullable<TextDiagnosticsRecord['runtime']>['capture'] {
  if (!input.capture) {
    return null;
  }

  return { policyHash: input.capture.policy.hash, native: input.capture.nativeOutcome, diagnosticSession: sessionOutcome, equivalence: 'identical-policy' };
}

function describeSource(loaded: LoadedTextSource): NonNullable<TextDiagnosticsRecord['source']> {
  const { source } = loaded.bundle;
  return {
    id: source.id,
    scope: source.scope,
    sourceVersion: source.sourceVersion,
    document: source.document,
    fileIdentity: source.fileIdentity,
    capturedAt: source.capturedAt,
    ...(source.receipt ? { receipt: source.receipt } : {}),
    ...(source.provider ? { provider: source.provider } : {})
  };
}

function describeConversions(loaded: LoadedTextSource, input: RunTextDiagnosticsInput): TextDiagnosticsRecord['conversions'] {
  const conversions: TextDiagnosticsRecord['conversions'] = [
    { field: 'box', operation: 'Source box used as CSS pixels in the reference coordinate space; fractional values preserved, no rounding.', exact: true },
    { field: 'outline.bounds', operation: 'Outline placed with fractional x/y on an SVG <image>, avoiding CSS layout snapping.', exact: true }
  ];
  for (const configured of input.config.parts) {
    const tracking = loaded.bundle.parts.find((part) => part.id === configured.id)?.typography.tracking;
    if (tracking?.unit === 'percent') {
      conversions.push({ field: `${configured.id}.letterSpacing`, operation: 'Percent tracking converted to CSS pixels as value/100 x font size.', exact: true });
    }
  }
  return conversions;
}

function describeNativeOutcome(result: ImageDiffResult): NativeOutcome {
  return {
    status: result.status,
    classification: result.classification,
    diffPixels: result.diffPixels,
    diffRatio: result.diffRatio,
    threshold: result.threshold ?? null,
    unchanged: true
  };
}

async function rejected(
  input: RunTextDiagnosticsInput,
  native: NativeOutcome,
  state: Exclude<TextDiagnosticsState, 'available' | 'not-configured'>,
  reasons: DiagnosticReason[],
  loaded?: LoadedTextSource
): Promise<RunTextDiagnosticsResult> {
  // Rejected input is described, never displayed as evidence: no artifacts, parts or experiments are attached.
  const record: TextDiagnosticsRecord = {
    schema: textDiagnosticsRecordSchemaId,
    state,
    statement: textDiagnosticsStatement,
    runId: input.runId,
    caseId: input.caseId,
    reasons,
    nativeOutcome: native,
    source: loaded ? describeSource(loaded) : null,
    inputs: null,
    runtime: null,
    parts: [],
    experiments: [],
    inference: null,
    artifacts: [],
    conversions: [],
    limitations: [...fixedLimitations],
    shaping: shapingUnsupported
  };
  return finalize(input, record, []);
}

async function finalize(input: RunTextDiagnosticsInput, record: TextDiagnosticsRecord, extraArtifacts: RecordArtifact[]): Promise<RunTextDiagnosticsResult> {
  const recordPath = `${input.artifactBase}/text-diagnostics/record.json`;
  const written = await input.store.writeJson(recordPath, record);
  const refs: ArtifactRef[] = [
    ...extraArtifacts.map((artifact) => toArtifactRef(artifact)),
    { type: 'metadata', role: 'evidence', path: recordPath, ...(written.bytes !== undefined ? { bytes: written.bytes } : {}), ...(written.sha256 ? { sha256: written.sha256 } : {}) }
  ];
  return { record, artifacts: refs };
}

function toArtifactRef(artifact: RecordArtifact): ArtifactRef {
  return { type: 'image', role: 'evidence', path: artifact.path, bytes: artifact.bytes, sha256: artifact.sha256 };
}

function sha256(bytes: Buffer | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}
