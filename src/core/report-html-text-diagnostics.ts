import { escapeAttr, escapeHtml } from './html-escape.js';
import type { CheckResult } from './report-schema.js';

// Reports are data from disk, so every field is checked before it is rendered and every string is escaped.
type Loose = Record<string, unknown>;

const recordSchemaId = 'reflection.text-diagnostics/v1';

export function renderTextDiagnosticsPanel(check: CheckResult): string {
  const record = check.metadata.textDiagnostics;
  if (!isObject(record) || record.schema !== recordSchemaId) {
    return '';
  }

  const state = String(record.state ?? 'unknown');
  const reasons = asArray(record.reasons).filter(isObject);
  const available = state === 'available';
  return `<section class="text-diagnostics" aria-label="Text diagnostics">
    <div class="text-diagnostics__head">
      <h4>Text diagnostics</h4>
      <span class="badge badge--suite">diagnostic only</span>
      <span class="badge badge--${available ? 'pass' : 'warn'}">${escapeHtml(state)}</span>
      ${renderSourceBadges(record)}
    </div>
    <p class="text-diagnostics__statement">${escapeHtml(record.statement ?? '')}</p>
    ${renderNativeOutcome(record)}
    ${reasons.length > 0 ? `<ul class="text-diagnostics__reasons">${reasons.map((reason) => `<li><code>${escapeHtml(reason.code)}</code> ${escapeHtml(reason.message)}</li>`).join('')}</ul>` : ''}
    ${available ? renderAvailable(record, check) : ''}
  </section>`;
}

function renderAvailable(record: Loose, check: CheckResult): string {
  return `${renderInference(record)}
    ${renderImages(record, check)}
    ${renderObservations(record)}
    ${renderExperiments(record)}
    ${renderProvenance(record)}
    <p class="text-diagnostics__note">${escapeHtml(isObject(record.shaping) ? record.shaping.reason : '')}</p>`;
}

function renderSourceBadges(record: Loose): string {
  const source = record.source;
  if (!isObject(source)) {
    return '';
  }

  const identity = isObject(source.fileIdentity) ? String(source.fileIdentity.verification ?? 'unknown') : 'unknown';
  const scope = source.scope === 'live-diagnostic' ? 'live, unversioned source' : source.scope === 'pinned' ? 'pinned source' : 'source scope unknown';
  const version = source.sourceVersion === null || source.sourceVersion === undefined ? 'source version unknown' : `source version ${String(source.sourceVersion)}`;
  return `<span class="badge badge--suite">${escapeHtml(scope)}</span>
    <span class="badge badge--suite">${escapeHtml(version)}</span>
    <span class="badge badge--suite">identity: ${escapeHtml(identity)}</span>`;
}

function renderNativeOutcome(record: Loose): string {
  const native = record.nativeOutcome;
  if (!isObject(native)) {
    return '';
  }

  return `<p class="text-diagnostics__native"><strong>Native screenshot result (unchanged):</strong> ${escapeHtml(native.status)} · ${escapeHtml(native.diffPixels)} differing pixels (${escapeHtml(formatRatio(native.diffRatio))}) · threshold ${escapeHtml(JSON.stringify(native.threshold ?? null))}</p>`;
}

function renderInference(record: Loose): string {
  const inference = record.inference;
  if (!isObject(inference)) {
    return '';
  }

  const list = (items: unknown): string => `<ul>${asArray(items).map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
  return `<div class="text-diagnostics__inference">
    <p><strong>${escapeHtml(inference.id)}</strong> · confidence ${escapeHtml(inference.confidence)}</p>
    <p>${escapeHtml(inference.summary)}</p>
    ${asArray(inference.supportedBy).length > 0 ? `<p class="eyebrow">Supported by</p>${list(inference.supportedBy)}` : ''}
    ${asArray(inference.limitations).length > 0 ? `<p class="eyebrow">Limitations</p>${list(inference.limitations)}` : ''}
  </div>`;
}

function renderImages(record: Loose, check: CheckResult): string {
  const allowedPaths = new Set(check.artifacts.map((artifact) => artifact.path));
  const items: Array<{ label: string; path: string }> = [];
  for (const artifact of asArray(record.artifacts).filter(isObject)) {
    const path = String(artifact.path ?? '');
    const role = String(artifact.role ?? '');
    if (!allowedPaths.has(path) || !isSafeRelativePath(path) || !/\.(png|svg)$/.test(path)) {
      continue;
    }
    items.push({ label: roleLabel(role), path });
  }

  if (items.length === 0) {
    return '';
  }

  return `<div class="text-diagnostics__images">${items
    .map((item) => `<a href="${escapeAttr(item.path)}"><span>${escapeHtml(item.label)}</span><img src="${escapeAttr(item.path)}" alt="${escapeAttr(item.label)}" loading="lazy"></a>`)
    .join('')}</div>`;
}

function renderObservations(record: Loose): string {
  const rows = asArray(record.parts)
    .filter(isObject)
    .flatMap((part) =>
      asArray(part.observations)
        .filter(isObject)
        .map(
          (observation) => `<tr class="obs--${escapeAttr(observation.comparison)}">
            <td>${escapeHtml(part.id)}</td><td>${escapeHtml(observation.field)}</td>
            <td>${escapeHtml(formatValue(observation.source))} <small>${escapeHtml(observation.sourceBasis)}</small></td>
            <td>${escapeHtml(formatValue(observation.runtime))} <small>${escapeHtml(observation.runtimeBasis)}</small></td>
            <td>${escapeHtml(formatValue(observation.delta))}</td><td>${escapeHtml(formatValue(observation.tolerance))}</td>
            <td>${escapeHtml(observation.comparison)}${observation.classification ? ` <small>${escapeHtml(observation.classification)}</small>` : ''}</td></tr>`
        )
    );

  if (rows.length === 0) {
    return '';
  }

  return `<table class="text-diagnostics__table"><caption>Source and runtime observations</caption>
    <thead><tr><th>Part</th><th>Field</th><th>Source</th><th>Runtime</th><th>Delta</th><th>Tolerance</th><th>Result</th></tr></thead>
    <tbody>${rows.join('')}</tbody></table>`;
}

function renderExperiments(record: Loose): string {
  const rows = asArray(record.experiments)
    .filter(isObject)
    .map((experiment) => {
      const measurement = isObject(experiment.measurement) ? experiment.measurement : undefined;
      const native = isObject(experiment.nativeMeasurement) ? experiment.nativeMeasurement : undefined;
      return `<tr><td>${escapeHtml(experiment.id)}</td><td>${escapeHtml(experiment.state)}${experiment.reason ? ` — ${escapeHtml(experiment.reason)}` : ''}</td>
        <td>${measurement ? escapeHtml(measurement.totalDiffPixels) : '—'}</td><td>${measurement ? escapeHtml(measurement.regionDiffPixels) : '—'}</td><td>${native ? escapeHtml(native.regionDiffPixels) : '—'}</td></tr>`;
    });

  if (rows.length === 0) {
    return '';
  }

  return `<table class="text-diagnostics__table"><caption>Rendering-path experiments (diagnostic renders, not implementation evidence)</caption>
    <thead><tr><th>Experiment</th><th>State</th><th>Differing pixels vs reference</th><th>…in text region</th><th>Native screenshot, same region</th></tr></thead>
    <tbody>${rows.join('')}</tbody></table>`;
}

function renderProvenance(record: Loose): string {
  const inputs = record.inputs;
  if (!isObject(inputs)) {
    return '';
  }

  return `<p class="text-diagnostics__note">Binding key <code>${escapeHtml(inputs.bindingKey)}</code> · run ${escapeHtml(record.runId)} · case ${escapeHtml(record.caseId)}. A different binding key means this evidence describes a different comparison.</p>`;
}

function roleLabel(role: string): string {
  const labels: Record<string, string> = {
    'reference-image': 'Reference (oracle)',
    'implementation-screenshot': 'Real implementation screenshot',
    'native-diff': 'Native comparison diff',
    'source-outline': 'Outlined source (diagnostic)',
    'diagnostic-render': 'Diagnostic render (not implementation evidence)',
    'comparison-image': 'Diagnostic render vs reference'
  };
  return labels[role] ?? role;
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '—';
  }
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

function formatRatio(value: unknown): string {
  return typeof value === 'number' ? `${(value * 100).toFixed(2)}%` : '—';
}

function isSafeRelativePath(path: string): boolean {
  return path.length > 0 && !path.startsWith('/') && !/^[A-Za-z][A-Za-z0-9+.-]*:/.test(path) && !path.split('/').includes('..');
}

function isObject(value: unknown): value is Loose {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
