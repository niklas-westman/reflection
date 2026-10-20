import { useEffect, useState, type ReactNode } from 'react';
import styled from 'styled-components';
import type { InspectorModel } from '../../model/inspector-model';
import { INSPECTOR_MODES, ZOOMS, type InspectorMode, type InspectorView, type Zoom } from '../../model/inspector-state';
import { Segmented } from '../atoms/segmented';
import { CELL_DISPLAY, cellDisplay, StatusLabel } from '../atoms/outcome-status';
import { StatusGlyph } from '../atoms/status-glyph';
import { EvidenceStage, useBlink, type Size } from './evidence-stage';
import { FreshnessFacts } from '../molecules/freshness-facts';

const Header = styled.header`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: ${({ theme }) => theme.space.sm};

  h1 {
    margin: 0;
    font-size: ${({ theme }) => theme.font.xl};
    letter-spacing: -0.02em;
    font-weight: 650;
  }
  .grow {
    flex: 1;
  }
  .pager {
    display: inline-flex;
    align-items: center;
    gap: ${({ theme }) => theme.space.xs};
    color: var(--muted);
    font-size: ${({ theme }) => theme.font.sm};
  }
  .pager a,
  .pager span[aria-disabled='true'] {
    padding: 0.3125rem ${({ theme }) => theme.space.sm};
    border: 1px solid var(--border-strong);
    border-radius: ${({ theme }) => theme.radius.md};
    background: var(--surface);
    color: var(--text);
    text-decoration: none;
  }
  .pager span[aria-disabled='true'] {
    color: var(--muted);
    cursor: not-allowed;
  }
`;

const Strip = styled.dl`
  display: flex;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.space.xs} ${({ theme }) => theme.space.xl};
  margin: ${({ theme }) => theme.space.sm} 0;
  padding: ${({ theme }) => theme.space.sm} ${({ theme }) => theme.space.md};
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: ${({ theme }) => theme.radius.lg};

  dt {
    color: var(--muted);
    font-size: ${({ theme }) => theme.font.xs};
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  dd {
    margin: 0.125rem 0 0;
    font-size: ${({ theme }) => theme.font.sm};
  }
  .caution {
    color: var(--gap);
    font-weight: 600;
  }
`;

const Controls = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: ${({ theme }) => theme.space.sm};
  margin-bottom: ${({ theme }) => theme.space.sm};

  label {
    display: inline-flex;
    align-items: center;
    gap: ${({ theme }) => theme.space.xs};
    font-size: ${({ theme }) => theme.font.sm};
  }
  .toggle[aria-pressed='true'] {
    background: var(--accent-bg);
    color: var(--accent);
    font-weight: 600;
  }
  .toggle {
    border: 1px solid var(--border-strong);
    border-radius: ${({ theme }) => theme.radius.md};
    background: var(--surface);
    padding: 0.375rem ${({ theme }) => theme.space.sm};
    font-size: ${({ theme }) => theme.font.sm};
  }
  .toggle:disabled {
    color: var(--muted);
    cursor: not-allowed;
  }
  .hint {
    color: var(--muted);
    font-size: ${({ theme }) => theme.font.xs};
  }
`;

// The images are the evidence, so they take the width. The rail sits beside them only on a very wide screen;
// otherwise its cards line up below the images.
const WIDE_ENOUGH_FOR_RAIL = '(min-width: 1700px)';

const SupersededNotice = styled.p`
  margin: 0 0 ${({ theme }) => theme.space.sm};
  padding: ${({ theme }) => theme.space.sm} ${({ theme }) => theme.space.md};
  background: var(--gap-bg);
  color: var(--gap);
  border-radius: ${({ theme }) => theme.radius.md};
  font-weight: 600;
`;

const Workspace = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: ${({ theme }) => theme.space.md};
  align-items: start;

  @media ${WIDE_ENOUGH_FOR_RAIL} {
    grid-template-columns: minmax(0, 1fr) 17.5rem;
  }
`;

const Rail = styled.aside`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 17.5rem), 1fr));
  gap: ${({ theme }) => theme.space.sm};
  align-items: start;

  @media ${WIDE_ENOUGH_FOR_RAIL} {
    grid-template-columns: minmax(0, 1fr);
  }
`;

const Card = styled.section<{ $caution?: boolean }>`
  padding: ${({ theme }) => theme.space.md};
  background: ${({ $caution }) => ($caution ? 'var(--gap-bg)' : 'var(--surface)')};
  border: 1px solid ${({ $caution }) => ($caution ? 'transparent' : 'var(--border)')};
  border-radius: ${({ theme }) => theme.radius.lg};
  color: ${({ $caution }) => ($caution ? 'var(--gap)' : 'inherit')};
  min-width: 0;

  summary {
    cursor: pointer;
  }
  summary h2 {
    display: inline;
  }
  summary .muted {
    display: block;
  }
  details[open] summary {
    margin-bottom: ${({ theme }) => theme.space.xs};
  }
  h2 {
    margin: 0 0 ${({ theme }) => theme.space.xs};
    font-size: ${({ theme }) => theme.font.md};
  }
  dl {
    margin: 0;
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0.25rem ${({ theme }) => theme.space.sm};
    font-size: ${({ theme }) => theme.font.sm};
  }
  dt {
    color: var(--muted);
  }
  dd {
    margin: 0;
    text-align: right;
    overflow-wrap: anywhere;
  }
  /* A tool's id breaks only where BreakableKey allows, between its words. */
  dd .key {
    overflow-wrap: normal;
  }
  dd.mono {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: ${({ theme }) => theme.font.xs};
    text-align: left;
  }
  ul {
    margin: 0;
    padding-left: 1.1rem;
    font-size: ${({ theme }) => theme.font.sm};
  }
  p {
    margin: 0 0 ${({ theme }) => theme.space.xs};
    font-size: ${({ theme }) => theme.font.sm};
  }
  .muted {
    color: var(--muted);
  }
  details summary {
    cursor: pointer;
    color: var(--muted);
    font-size: ${({ theme }) => theme.font.sm};
  }
`;

const Lower = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 20rem), 1fr));
  gap: ${({ theme }) => theme.space.sm};
  margin-top: ${({ theme }) => theme.space.md};
`;

export interface ComparisonInspectorProps {
  model: InspectorModel;
  view: InspectorView;
  onViewChange: (view: InspectorView) => void;
  // Where each neighbour opens, and where the subject page is; absent at either end of the list.
  hrefs: { subject: string; previous: string | undefined; next: string | undefined; sibling: (id: string) => string };
  subjectLabel: string;
  offline: boolean;
  onNavigate: (href: string) => void;
}

const prefersReducedMotion = (): boolean => typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function ComparisonInspector({ model, view, onViewChange, hrefs, subjectLabel, offline, onNavigate }: ComparisonInspectorProps): ReactNode {
  const [sizes, setSizes] = useState<Partial<Record<'reference' | 'actual' | 'diff', Size>>>({});
  const [opacity, setOpacity] = useState(50);
  const [wipe, setWipe] = useState(50);
  const [blinking, setBlinking] = useState(false);
  const reduced = prefersReducedMotion();
  const blinkShown = useBlink(blinking && !reduced);
  const shownOpacity = blinking && !reduced ? (blinkShown ? 100 : 0) : opacity;

  const setMode = (mode: InspectorMode): void => onViewChange({ ...view, mode });
  const setZoom = (zoom: Zoom): void => onViewChange({ ...view, zoom });

  // Keyboard: j and k (or the arrow keys) move between comparisons, 1 to 5 switch the mode. Never while typing or in a control.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null;
      if (event.metaKey || event.ctrlKey || event.altKey || (target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName))) return;
      if ((event.key === 'j' || event.key === 'ArrowRight') && hrefs.next) onNavigate(hrefs.next);
      else if ((event.key === 'k' || event.key === 'ArrowLeft') && hrefs.previous) onNavigate(hrefs.previous);
      else if (['1', '2', '3', '4', '5'].includes(event.key)) setMode(INSPECTOR_MODES[Number(event.key) - 1]?.mode ?? view.mode);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const display = cellDisplay(model.unusable ? 'not-run' : model.outcome, model.unusable, model.superseded !== undefined);
  const diffMetricText = model.diffSummary ? `${model.diffSummary.label}: ${model.diffSummary.valueText}${model.diffSummary.ratio !== undefined ? ` (ratio ${model.diffSummary.ratio})` : ''}` : undefined;
  const { sequence } = model;

  return (
    <>
      <p style={{ margin: '0 0 0.5rem' }}>
        <a href={hrefs.subject}>← Back to {subjectLabel}</a>
      </p>
      <Header>
        <h1>{model.label}</h1>
        <StatusLabel display={display} />
        <span className="grow" />
        <nav className="pager" aria-label="Move between comparisons">
          {hrefs.previous ? <a href={hrefs.previous} rel="prev">Previous</a> : <span aria-disabled="true">Previous</span>}
          <span aria-live="polite">
            {sequence.index + 1} of {sequence.ids.length}
            {sequence.filtered ? '' : ' (whole subject)'}
          </span>
          {hrefs.next ? <a href={hrefs.next} rel="next">Next</a> : <span aria-disabled="true">Next</span>}
        </nav>
      </Header>
      <Strip aria-label="Recorded facts">
        {model.facts.map((fact) => (
          <div key={fact.label}>
            <dt>{fact.label}</dt>
            <dd>{fact.value}</dd>
          </div>
        ))}
        {model.caution ? (
          <div>
            <dt>Reference approval</dt>
            <dd className="caution">▲ Not confirmed by a person</dd>
          </div>
        ) : null}
      </Strip>
      {model.superseded ? (
        <SupersededNotice role="status">
          ▲ Evidence from a superseded design source. This check proved {model.superseded.source}; the design moved on to {model.superseded.replacedBy}. It counts as not proven.
        </SupersededNotice>
      ) : null}
      <Controls role="toolbar" aria-label="Comparison view">
        <Segmented role="group" aria-label="Comparison mode">
          {INSPECTOR_MODES.map((entry, index) => (
            <button key={entry.mode} type="button" aria-pressed={view.mode === entry.mode} title={`${entry.label} (${index + 1})`} onClick={() => setMode(entry.mode)}>
              {entry.label}
            </button>
          ))}
        </Segmented>
        <Segmented role="group" aria-label="Zoom">
          {ZOOMS.map((zoom) => (
            <button key={String(zoom)} type="button" aria-pressed={view.zoom === zoom} onClick={() => setZoom(zoom)}>
              {zoom === 'fit' ? 'Fit' : `${zoom}%`}
            </button>
          ))}
        </Segmented>
        <button className="toggle" type="button" aria-pressed={view.checkerboard} onClick={() => onViewChange({ ...view, checkerboard: !view.checkerboard })}>
          Checkerboard
        </button>
        {view.mode === 'overlay' ? (
          <>
            <label>
              Implementation opacity
              <input type="range" min={0} max={100} value={opacity} onChange={(event) => setOpacity(Number(event.target.value))} disabled={blinking && !reduced} />
            </label>
            <button className="toggle" type="button" aria-pressed={blinking} disabled={reduced} title={reduced ? 'Blinking is off because reduced motion is requested' : undefined} onClick={() => setBlinking((value) => !value)}>
              Blink
            </button>
          </>
        ) : null}
        {view.mode === 'wipe' ? (
          <label>
            Wipe position
            <input type="range" min={0} max={100} value={wipe} onChange={(event) => setWipe(Number(event.target.value))} />
          </label>
        ) : null}
        <span className="hint">Keys: j and k move between comparisons, 1 to 5 switch the mode.</span>
      </Controls>
      <Workspace>
        <EvidenceStage
          mode={view.mode}
          zoom={view.zoom}
          checkerboard={view.checkerboard}
          reference={model.referenceArtifact}
          actual={model.actualArtifact}
          diff={model.diffArtifact}
          diffMetricText={diffMetricText}
          referenceMissingReason={model.row?.reference.availability === 'missing' ? 'No design exists to compare against.' : 'No reference image was recorded for this comparison.'}
          implementationLabel={model.implementation ?? 'Implementation'}
          opacity={shownOpacity}
          wipe={wipe}
          sizes={sizes}
          onSizes={(slot, size) => setSizes((current) => ({ ...current, [slot]: size }))}
        />
        <Rail>
          <ResultCard model={model} offline={offline} />
          {model.deviation ? (
            <Card $caution={!model.deviation.holds} aria-label="Accepted deviation">
              <h2>Accepted deviation</h2>
              <p>The owner accepted this difference. It is a review decision: the result above is as recorded, not changed by it.</p>
              <p>{model.deviation.standing}</p>
              <dl>
                {model.deviation.facts.map((fact) => (
                  <FactRow key={fact.label} fact={fact} />
                ))}
              </dl>
            </Card>
          ) : null}
          <Card>
            <FreshnessFacts lines={model.freshness} inCard />
          </Card>
          <MeasurementsCard model={model} />
          {model.caution || model.approvalFacts.length > 0 ? (
            <Card $caution={model.caution !== undefined} aria-label="Reference provenance">
              <h2>Reference provenance</h2>
              {model.caution ? <p>{model.caution}</p> : null}
              {model.approvalFacts.length > 0 ? (
                <dl>
                  {model.approvalFacts.map((fact) => (
                    <FactRow key={fact.label} fact={fact} />
                  ))}
                </dl>
              ) : null}
            </Card>
          ) : null}
        </Rail>
      </Workspace>
      <Lower>
        <Card aria-label="Provenance">
          <details>
            <summary>
              <h2>Provenance</h2>
              <span className="muted">Run, environment, design source and file hashes</span>
            </summary>
            <dl>
              {model.provenance.map((fact) => (
                <FactRow key={fact.label} fact={fact} />
              ))}
            </dl>
          </details>
        </Card>
        <Card aria-label="Gaps">
          <h2>Gaps</h2>
          {model.gaps.length === 0 ? <p className="muted">Nothing is recorded as unproven for this comparison.</p> : <ul>{model.gaps.map((gap) => <li key={gap}>{gap}</li>)}</ul>}
          {model.limitations.length > 0 ? (
            <>
              <h2 style={{ marginTop: '0.75rem' }}>Limitations recorded</h2>
              <ul>{model.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}</ul>
            </>
          ) : null}
        </Card>
        <Card aria-label="Related">
          <h2>Related</h2>
          {model.siblings.length === 0 ? (
            <p className="muted">{model.implementationsRecorded ? 'No other implementation was compared for this item.' : 'This release records no implementations to relate.'}</p>
          ) : (
            <>
              <p className="muted">The same required item in other implementations</p>
              <ul>
                {model.siblings.map((sibling) => (
                  <li key={sibling.id}>
                    <a href={hrefs.sibling(sibling.id)}>{sibling.label}</a> <span className="muted">{cellDisplay(sibling.outcome, false).text}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          {model.comparison.sourceNodeIds && model.comparison.sourceNodeIds.length > 0 ? <p className="muted">Design source nodes recorded by the provider: {model.comparison.sourceNodeIds.join(', ')}</p> : null}
        </Card>
      </Lower>
    </>
  );
}

/** A tool's id with line breaks allowed only between its words (at a hyphen, an underscore or a capital), never inside one. */
function BreakableKey({ text }: { text: string }): ReactNode {
  const parts = text.split(/(?<=[-_.])|(?=[A-Z])/);
  return (
    <span className="key">
      {parts.map((part, index) => (
        <span key={`${part}-${index}`}>
          {index > 0 ? <wbr /> : null}
          {part}
        </span>
      ))}
    </span>
  );
}

function FactRow({ fact }: { fact: { label: string; value: string; mono?: boolean } }): ReactNode {
  return (
    <>
      <dt>{fact.label}</dt>
      <dd className={fact.mono ? 'mono' : undefined}>{fact.value}</dd>
    </>
  );
}

function ResultCard({ model, offline }: { model: InspectorModel; offline: boolean }): ReactNode {
  const display = cellDisplay(model.unusable ? 'not-run' : model.outcome, model.unusable, model.superseded !== undefined);
  return (
    <Card aria-label="Verification result">
      <h2>Verification result</h2>
      <p>
        <StatusLabel display={display} />
      </p>
      <p className="muted">
        {model.unusable
          ? 'A file behind this comparison is unusable, so the recorded result cannot be trusted.'
          : model.superseded
            ? `Recorded as ${CELL_DISPLAY[model.superseded.recordedOutcome].text.toLowerCase()} against a design source that was superseded, so it is not counted.`
            : 'As recorded in this bundle.'}{' '}
        {offline ? 'Freshness cannot be rechecked offline.' : ''}
      </p>
      <dl>
        <dt>Required item</dt>
        <dd>{model.row?.label ?? 'Not tied to a required item'}</dd>
        <dt>Recorded as</dt>
        <dd>{model.verdict}</dd>
        {model.nativeOutcome ? (
          <>
            <dt>Native</dt>
            <dd>
              {model.nativeOutcome} <span className="muted">(the tool's own word, not counted)</span>
            </dd>
          </>
        ) : null}
        <dt>Source status</dt>
        <dd>{offline ? 'Not verified' : 'Checked'}</dd>
      </dl>
    </Card>
  );
}

function MeasurementsCard({ model }: { model: InspectorModel }): ReactNode {
  const { measurements, diffSummary } = model;
  return (
    <Card aria-label="Measurements">
      <h2>Measurements</h2>
      {diffSummary ? (
        <dl>
          <dt>{diffSummary.label === diffSummary.metric ? 'Recorded metric' : diffSummary.label}</dt>
          <dd>
            {diffSummary.label === diffSummary.metric ? <BreakableKey text={diffSummary.metric} /> : null} {diffSummary.valueText}
            {diffSummary.ratio !== undefined ? <span className="muted"> (ratio {diffSummary.ratio})</span> : null}
            {diffSummary.meaning ? <div className="muted">{diffSummary.meaning}</div> : null}
            {diffSummary.label !== diffSummary.metric ? (
              <div className="muted">
                <BreakableKey text={diffSummary.metric} />
              </div>
            ) : null}
          </dd>
          <dt>Recorded threshold</dt>
          <dd>
            {diffSummary.threshold.length > 0
              ? diffSummary.threshold.map((entry) => (
                  <div key={entry.name}>
                    <BreakableKey text={entry.name} /> {entry.value}
                  </div>
                ))
              : 'Not recorded'}
          </dd>
        </dl>
      ) : null}
      {measurements ? (
        <>
          {measurements.sentence ? <p>{measurements.sentence}</p> : null}
          <ul>
            {measurements.failing.map((sample) => (
              <li key={`${sample.part}.${sample.property}`}>
                <StatusGlyph kind="failed" label="Failed" /> {sample.part} {sample.property}: expected {sample.expected}, actual {sample.actual}
                {sample.delta ? `, ${sample.delta}` : ''}
                {sample.tolerance ? `, tolerance ${sample.tolerance}` : ''}
              </li>
            ))}
          </ul>
          {measurements.passing.length > 0 ? (
            <details>
              <summary>{measurements.passing.length} passed</summary>
              <ul>
                {measurements.passing.map((sample) => (
                  <li key={`${sample.part}.${sample.property}`}>
                    {sample.part} {sample.property}: {sample.actual}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
          {measurements.failing.length === 0 && measurements.passing.length === 0 ? <p className="muted">{measurements.total} measurements were recorded, with no detail.</p> : null}
        </>
      ) : (
        <p className="muted">{model.bundleRecordsMeasurements ? 'Detailed measurements: Not recorded.' : 'This release records pixel comparisons only, no detailed measurements.'}</p>
      )}
    </Card>
  );
}
