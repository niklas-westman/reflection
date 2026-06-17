import type { ArtifactRef, CheckDiagnostic, CheckResult, ReflectionReport } from './report-schema.js';

const STATUS_LABELS: Record<ReflectionReport['status'], string> = {
  pass: 'Pass',
  fail: 'Fail',
  'pass-with-review': 'Review',
  error: 'Error'
};

export function renderHtmlReport(report: ReflectionReport): string {
  const blocking = report.checks.filter(isBlockingFailure);
  const review = report.checks.filter(isReviewItem);
  const visualChecks = report.checks.filter((check) => check.suite === 'visual');
  const checkCards = report.checks.map(renderCheckCard).join('\n');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Reflection Report · ${escapeHtml(report.project)} · ${escapeHtml(report.status)}</title>
  <style>${renderReportCss()}</style>
</head>
<body>
  <script id="reflection-report-data" type="application/json">${escapeJsonForScript(report)}</script>
  <main class="shell">
    <header class="hero hero--${escapeAttr(report.status)}">
      <div>
        <p class="eyebrow">Reflection Report</p>
        <h1>${escapeHtml(report.project)}</h1>
        <div class="meta-line">
          <span>${escapeHtml(report.runId)}</span>
          <span>${escapeHtml(report.mode)}</span>
          <span>${report.ci ? 'CI' : 'Local'}</span>
        </div>
      </div>
      <div class="hero-status">
        <span class="status-pill status-pill--${escapeAttr(report.status)}">${STATUS_LABELS[report.status]}</span>
        <div class="artifact-actions">
          <a href="report.json">JSON</a>
          <a href="report.md">Markdown</a>
        </div>
      </div>
    </header>

    <section class="metric-grid" aria-label="Run summary">
      ${renderMetric('Passed', report.summary.passed, 'pass')}
      ${renderMetric('Failed', report.summary.failed, 'fail')}
      ${renderMetric('Warnings', report.summary.warnings, 'warn')}
      ${renderMetric('Skipped', report.summary.skipped, 'skipped')}
      ${renderMetric('Blocking', report.summary.blockingFailures, 'blocking')}
      ${renderMetric('Review', report.summary.reviewItems, 'review')}
    </section>

    ${renderAttentionSection(blocking, review)}
    ${renderVisualSection(visualChecks)}
    ${renderSuggestedNextSteps(report)}

    <section class="panel">
      <div class="panel-heading">
        <div>
          <p class="eyebrow">All checks</p>
          <h2>Checks</h2>
        </div>
        <div class="filters" aria-label="Check filters">
          <input id="check-search" type="search" placeholder="Filter checks, targets, diagnostics..." aria-label="Filter checks">
          <select id="suite-filter" aria-label="Filter by suite">
            <option value="all">All suites</option>
            ${renderSuiteOptions(report.checks)}
          </select>
          <select id="status-filter" aria-label="Filter by status">
            <option value="all">All statuses</option>
            <option value="pass">Pass</option>
            <option value="fail">Fail</option>
            <option value="warn">Warn</option>
            <option value="error">Error</option>
            <option value="skipped">Skipped</option>
          </select>
        </div>
      </div>
      <div id="check-count" class="result-count">${report.checks.length} checks</div>
      <div id="check-list" class="check-list">
        ${checkCards}
      </div>
    </section>
  </main>
  <script>${renderReportScript()}</script>
</body>
</html>
`;
}

function renderMetric(label: string, value: number, tone: string): string {
  return `<article class="metric metric--${escapeAttr(tone)}"><span>${escapeHtml(label)}</span><strong>${value}</strong></article>`;
}

function renderAttentionSection(blocking: CheckResult[], review: CheckResult[]): string {
  if (blocking.length === 0 && review.length === 0) {
    return `<section class="panel panel--success">
      <p class="eyebrow">Attention</p>
      <h2>No blocking failures or review items</h2>
      <p class="muted">The current run did not produce checks that require immediate triage.</p>
    </section>`;
  }

  return `<section class="panel">
    <div class="panel-heading">
      <div>
        <p class="eyebrow">Attention</p>
        <h2>Start here</h2>
      </div>
    </div>
    <div class="attention-grid">
      ${renderAttentionGroup('Blocking failures', blocking)}
      ${renderAttentionGroup('Review items', review)}
    </div>
  </section>`;
}

function renderAttentionGroup(title: string, checks: CheckResult[]): string {
  if (checks.length === 0) {
    return `<article class="attention-card attention-card--empty">
      <h3>${escapeHtml(title)}</h3>
      <p class="muted">None.</p>
    </article>`;
  }

  return `<article class="attention-card">
    <h3>${escapeHtml(title)}</h3>
    <div class="attention-list">
      ${checks.slice(0, 8).map(renderCompactCheck).join('\n')}
      ${checks.length > 8 ? `<p class="muted">+${checks.length - 8} more in all checks.</p>` : ''}
    </div>
  </article>`;
}

function renderVisualSection(checks: CheckResult[]): string {
  if (checks.length === 0) {
    return '';
  }

  const items = checks
    .filter((check) => check.status !== 'pass' || hasImageArtifacts(check.artifacts))
    .slice(0, 12)
    .map((check) => `<article class="visual-card">
      <div class="visual-card__header">
        ${renderCheckBadges(check)}
        <strong>${escapeHtml(check.id)}</strong>
      </div>
      <p>${escapeHtml(check.summary)}</p>
      ${renderArtifactPreview(check.artifacts)}
    </article>`)
    .join('\n');

  if (!items) {
    return '';
  }

  return `<section class="panel">
    <div class="panel-heading">
      <div>
        <p class="eyebrow">Visual evidence</p>
        <h2>Expected, actual, and diff</h2>
      </div>
    </div>
    <div class="visual-grid">${items}</div>
  </section>`;
}

function renderSuggestedNextSteps(report: ReflectionReport): string {
  if (report.suggestedNextSteps.length === 0) {
    return '';
  }

  return `<section class="panel">
    <p class="eyebrow">Next</p>
    <h2>Suggested next steps</h2>
    <ul class="next-list">
      ${report.suggestedNextSteps.map((step) => `<li>${escapeHtml(step.summary)}</li>`).join('\n')}
    </ul>
  </section>`;
}

function renderCheckCard(check: CheckResult): string {
  const searchText = [
    check.id,
    check.suite,
    check.target,
    check.status,
    check.severity,
    check.summary,
    check.details ?? '',
    check.failureClass ?? '',
    ...(check.recommendations ?? []),
    ...(check.diagnostics ?? []).map((diagnostic) => `${diagnostic.kind} ${diagnostic.message}`)
  ]
    .join(' ')
    .toLowerCase();

  return `<article class="check-card" data-check data-suite="${escapeAttr(check.suite)}" data-status="${escapeAttr(check.status)}" data-search="${escapeAttr(searchText)}">
    <div class="check-card__top">
      <div>
        ${renderCheckBadges(check)}
        <h3>${escapeHtml(check.id)}</h3>
      </div>
      <span class="severity">${escapeHtml(check.severity)}</span>
    </div>
    <p class="target">${escapeHtml(check.target)}</p>
    <p>${escapeHtml(check.summary)}</p>
    ${renderFailureClass(check)}
    ${renderDetails(check.details)}
    ${renderDiagnostics(check.diagnostics)}
    ${renderRecommendations(check)}
    ${renderArtifactList(check.artifacts)}
  </article>`;
}

function renderCompactCheck(check: CheckResult): string {
  return `<a class="compact-check" href="#${escapeAttr(check.id)}">
    ${renderCheckBadges(check)}
    <span>${escapeHtml(check.id)}</span>
    <small>${escapeHtml(check.summary)}</small>
  </a>`;
}

function renderCheckBadges(check: CheckResult): string {
  return `<span class="badge badge--${escapeAttr(check.status)}">${escapeHtml(check.status)}</span>
    <span class="badge badge--suite">${escapeHtml(check.suite)}</span>`;
}

function renderFailureClass(check: CheckResult): string {
  if (!check.failureClass) {
    return '';
  }

  const confidence = check.confidence !== undefined ? ` · ${Math.round(check.confidence * 100)}% confidence` : '';
  return `<p class="failure-class">${escapeHtml(check.failureClass)}${confidence}</p>`;
}

function renderDetails(details?: string): string {
  if (!details) {
    return '';
  }

  return `<details class="details"><summary>Details</summary><pre>${escapeHtml(details)}</pre></details>`;
}

function renderDiagnostics(diagnostics?: CheckDiagnostic[]): string {
  if (!diagnostics || diagnostics.length === 0) {
    return '';
  }

  return `<div class="diagnostics">
    <strong>Diagnostics</strong>
    ${diagnostics
      .map(
        (diagnostic) => `<div class="diagnostic">
          <span>${escapeHtml(diagnostic.kind)}</span>
          <p>${escapeHtml(diagnostic.message)}</p>
        </div>`
      )
      .join('\n')}
  </div>`;
}

function renderRecommendations(check: CheckResult): string {
  const recommendations = check.recommendations ?? [];
  const next = check.suggestedNextStep ? [check.suggestedNextStep] : [];
  const items = [...recommendations, ...next];
  if (items.length === 0) {
    return '';
  }

  return `<ul class="recommendations">
    ${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('\n')}
  </ul>`;
}

function renderArtifactList(artifacts: ArtifactRef[]): string {
  if (artifacts.length === 0) {
    return '';
  }

  return `<div class="artifact-list">
    ${artifacts.map((artifact) => `<a href="${escapeAttr(artifact.path)}">${escapeHtml(artifact.role ?? artifact.type)} · ${escapeHtml(artifact.path)}</a>`).join('\n')}
  </div>`;
}

function renderArtifactPreview(artifacts: ArtifactRef[]): string {
  const images = artifacts.filter(isImageArtifact);
  if (images.length === 0) {
    return renderArtifactList(artifacts);
  }

  return `<div class="artifact-preview">
    ${images
      .map(
        (artifact) => `<a href="${escapeAttr(artifact.path)}">
          <span>${escapeHtml(artifact.role ?? artifact.type)}</span>
          <img src="${escapeAttr(artifact.path)}" alt="${escapeAttr(artifact.role ?? artifact.type)} artifact for ${escapeAttr(artifact.path)}" loading="lazy">
        </a>`
      )
      .join('\n')}
  </div>`;
}

function renderSuiteOptions(checks: CheckResult[]): string {
  return [...new Set(checks.map((check) => check.suite))]
    .sort()
    .map((suite) => `<option value="${escapeAttr(suite)}">${escapeHtml(suite)}</option>`)
    .join('\n');
}

function isBlockingFailure(check: CheckResult): boolean {
  return check.severity === 'blocking' && (check.status === 'fail' || check.status === 'error');
}

function isReviewItem(check: CheckResult): boolean {
  return check.severity === 'review' && (check.status === 'warn' || check.status === 'fail');
}

function hasImageArtifacts(artifacts: ArtifactRef[]): boolean {
  return artifacts.some(isImageArtifact);
}

function isImageArtifact(artifact: ArtifactRef): boolean {
  return artifact.path.endsWith('.png') && ['expected', 'actual', 'diff'].includes(artifact.role ?? '');
}

function escapeHtml(value: unknown): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(value: unknown): string {
  return escapeHtml(value).replace(/`/g, '&#96;');
}

function escapeJsonForScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
}

function renderReportCss(): string {
  return `
:root {
  color-scheme: light;
  --bg: #f4f4f2;
  --panel: #ffffff;
  --panel-soft: #fafafa;
  --text: #141414;
  --muted: #666666;
  --border: #d8d8d4;
  --shadow: 0 18px 60px rgba(20, 20, 20, 0.08);
  --pass: #0f7a3b;
  --fail: #cc0033;
  --warn: #9a5b00;
  --review: #2f31fc;
  --skipped: #777777;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); }
a { color: inherit; }
.shell { width: min(1200px, calc(100% - 32px)); margin: 0 auto; padding: 32px 0 56px; }
.hero, .panel, .metric { background: var(--panel); border: 1px solid var(--border); border-radius: 18px; box-shadow: var(--shadow); }
.hero { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; padding: 28px; border-top: 6px solid var(--review); }
.hero--pass { border-top-color: var(--pass); }
.hero--fail, .hero--error { border-top-color: var(--fail); }
h1, h2, h3, p { margin: 0; }
h1 { font-size: clamp(32px, 5vw, 56px); line-height: 0.95; letter-spacing: -0.04em; }
h2 { font-size: 22px; line-height: 1.1; }
h3 { font-size: 15px; line-height: 1.25; }
.eyebrow { color: var(--muted); font-size: 11px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; }
.meta-line { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; color: var(--muted); font-size: 13px; }
.meta-line span { border: 1px solid var(--border); border-radius: 999px; padding: 5px 9px; background: var(--panel-soft); }
.hero-status { display: grid; gap: 14px; justify-items: end; }
.status-pill, .badge { display: inline-flex; align-items: center; border-radius: 999px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; }
.status-pill { padding: 10px 14px; font-size: 13px; color: #fff; background: var(--review); }
.status-pill--pass { background: var(--pass); }
.status-pill--fail, .status-pill--error { background: var(--fail); }
.artifact-actions { display: flex; gap: 8px; }
.artifact-actions a, .artifact-list a { border: 1px solid var(--border); border-radius: 8px; padding: 8px 10px; text-decoration: none; background: var(--panel-soft); font-size: 13px; }
.metric-grid { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 12px; margin: 18px 0; }
.metric { padding: 16px; box-shadow: none; }
.metric span { display: block; color: var(--muted); font-size: 12px; }
.metric strong { display: block; margin-top: 8px; font-size: 30px; line-height: 1; }
.panel { padding: 22px; margin-top: 18px; }
.panel--success { border-color: rgba(15, 122, 59, 0.25); }
.panel-heading { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; margin-bottom: 18px; }
.muted, .target { color: var(--muted); }
.attention-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
.attention-card { background: var(--panel-soft); border: 1px solid var(--border); border-radius: 14px; padding: 16px; }
.attention-list { display: grid; gap: 10px; margin-top: 14px; }
.compact-check { display: grid; gap: 4px; padding: 12px; border: 1px solid var(--border); border-radius: 12px; background: #fff; text-decoration: none; }
.compact-check small { color: var(--muted); }
.badge { padding: 4px 7px; margin: 0 5px 6px 0; font-size: 10px; background: #ececec; color: var(--muted); }
.badge--pass { background: rgba(15, 122, 59, 0.12); color: var(--pass); }
.badge--fail, .badge--error { background: rgba(204, 0, 51, 0.12); color: var(--fail); }
.badge--warn { background: rgba(154, 91, 0, 0.14); color: var(--warn); }
.badge--skipped { background: rgba(119, 119, 119, 0.14); color: var(--skipped); }
.badge--suite { background: rgba(47, 49, 252, 0.1); color: var(--review); }
.visual-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
.visual-card, .check-card { background: var(--panel-soft); border: 1px solid var(--border); border-radius: 14px; padding: 16px; }
.visual-card__header, .check-card__top { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; }
.artifact-preview { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin-top: 12px; }
.artifact-preview a { display: grid; gap: 6px; text-decoration: none; color: var(--muted); font-size: 11px; }
.artifact-preview img { width: 100%; max-height: 220px; object-fit: contain; background: #fff; border: 1px solid var(--border); border-radius: 10px; }
.next-list { margin: 12px 0 0; padding-left: 20px; }
.filters { display: flex; flex-wrap: wrap; gap: 8px; }
.filters input, .filters select { border: 1px solid var(--border); border-radius: 9px; background: #fff; color: var(--text); font: inherit; font-size: 13px; padding: 9px 10px; }
.result-count { margin-bottom: 12px; color: var(--muted); font-size: 13px; }
.check-list { display: grid; gap: 12px; }
.check-card[hidden] { display: none; }
.severity, .failure-class { color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; }
.details { margin-top: 12px; }
.details summary { cursor: pointer; color: var(--muted); }
pre { white-space: pre-wrap; overflow: auto; margin: 10px 0 0; padding: 12px; border-radius: 10px; background: #111; color: #f2f2f2; font-size: 12px; }
.diagnostics, .recommendations, .artifact-list { margin-top: 12px; }
.diagnostic { border-left: 3px solid var(--review); padding-left: 10px; margin-top: 8px; }
.diagnostic span { color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; }
.recommendations { padding-left: 20px; }
.artifact-list { display: flex; flex-wrap: wrap; gap: 8px; }
@media (max-width: 800px) {
  .hero, .panel-heading, .attention-grid, .visual-grid { display: grid; grid-template-columns: 1fr; }
  .hero-status { justify-items: start; }
  .metric-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .artifact-preview { grid-template-columns: 1fr; }
}
`;
}

function renderReportScript(): string {
  return `
const search = document.querySelector('#check-search');
const suite = document.querySelector('#suite-filter');
const status = document.querySelector('#status-filter');
const count = document.querySelector('#check-count');
const cards = Array.from(document.querySelectorAll('[data-check]'));
function applyFilters() {
  const query = String(search?.value || '').trim().toLowerCase();
  const suiteValue = String(suite?.value || 'all');
  const statusValue = String(status?.value || 'all');
  let visible = 0;
  for (const card of cards) {
    const matchesQuery = query.length === 0 || String(card.dataset.search || '').includes(query);
    const matchesSuite = suiteValue === 'all' || card.dataset.suite === suiteValue;
    const matchesStatus = statusValue === 'all' || card.dataset.status === statusValue;
    const show = matchesQuery && matchesSuite && matchesStatus;
    card.hidden = !show;
    if (show) visible += 1;
  }
  if (count) count.textContent = visible + ' of ' + cards.length + ' checks';
}
search?.addEventListener('input', applyFilters);
suite?.addEventListener('change', applyFilters);
status?.addEventListener('change', applyFilters);
applyFilters();
`;
}
