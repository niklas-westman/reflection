import { useState, type ReactNode } from 'react';
import styled from 'styled-components';
import type { ProofOutcome } from 'reflection-projection';
import { NO_DIMENSION_VALUE, type ItemDetail, type DimensionChoice, type AdapterCard, type ReferenceCard } from '../../model/gallery-model';
import { describeDate } from '../../model/gallery-model';
import type { MatrixColumn, MatrixRow } from '../../model/matrix-model';
import { paths, type SubjectKind } from '../../routes/paths';
import { ArtifactImage } from '../atoms/artifact-image';
import { Segmented } from '../atoms/segmented';
import { cellDisplay, READINESS_DISPLAY, StatusLabel } from '../atoms/outcome-status';
import { StatusGlyph, type GlyphKind } from '../atoms/status-glyph';

const Controls = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: ${({ theme }) => theme.space.sm};

  label,
  details {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-size: ${({ theme }) => theme.font.xs};
    color: var(--muted);
  }
  select,
  summary {
    min-width: 9rem;
    border: 1px solid var(--border-strong);
    border-radius: ${({ theme }) => theme.radius.md};
    background: var(--surface);
    color: var(--text);
    padding: 0.4375rem ${({ theme }) => theme.space.sm};
    font: inherit;
    font-size: ${({ theme }) => theme.font.md};
  }
  summary {
    cursor: pointer;
    list-style: none;
  }
  details {
    position: relative;
  }
  details > div {
    position: absolute;
    top: 3.25rem;
    z-index: 20;
    min-width: 11rem;
    padding: ${({ theme }) => theme.space.sm};
    background: var(--surface);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: ${({ theme }) => theme.radius.lg};
    box-shadow: var(--shadow);
    font-size: ${({ theme }) => theme.font.md};
  }
  details label {
    flex-direction: row;
    align-items: center;
    gap: ${({ theme }) => theme.space.xs};
    color: var(--text);
    font-size: ${({ theme }) => theme.font.md};
  }
`;

// Reference plus one card per chosen implementation. The columns never get narrower than a readable preview;
// beyond that the row scrolls sideways instead of squeezing the images.
const Cards = styled.div`
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(16rem, 1fr);
  gap: ${({ theme }) => theme.space.sm};
  overflow-x: auto;
  padding-bottom: ${({ theme }) => theme.space.xs};
`;

const CardBox = styled.article<{ $tone?: 'fail' | undefined }>`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space.xs};
  padding: ${({ theme }) => theme.space.sm};
  background: var(--surface);
  border: 1px solid ${({ $tone }) => ($tone === 'fail' ? 'color-mix(in srgb, var(--fail) 45%, transparent)' : 'var(--border)')};
  border-radius: ${({ theme }) => theme.radius.lg};

  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: ${({ theme }) => theme.space.xs};
  }
  h3 {
    margin: 0;
    font-size: ${({ theme }) => theme.font.md};
  }
  .meta {
    color: var(--muted);
    font-size: ${({ theme }) => theme.font.xs};
    min-height: 2.2em;
  }
  .caution {
    color: var(--gap);
    font-weight: 600;
  }
`;

const Lower = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 22rem), 1fr));
  gap: ${({ theme }) => theme.space.sm};
`;

const Panel = styled.section`
  padding: ${({ theme }) => theme.space.md};
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: ${({ theme }) => theme.radius.lg};

  h3 {
    margin: 0 0 ${({ theme }) => theme.space.sm};
    font-size: ${({ theme }) => theme.font.md};
  }
  dl {
    margin: 0;
    display: grid;
    grid-template-columns: 9rem 1fr;
    gap: ${({ theme }) => theme.space.xs} ${({ theme }) => theme.space.sm};
  }
  dt {
    color: var(--muted);
  }
  dd {
    margin: 0;
  }
  table {
    border-collapse: collapse;
    margin-top: ${({ theme }) => theme.space.sm};
    font-size: ${({ theme }) => theme.font.sm};
  }
  th,
  td {
    text-align: left;
    padding: 0.25rem ${({ theme }) => theme.space.sm} 0.25rem 0;
  }
  th {
    color: var(--muted);
    font-weight: 500;
  }
  .reason {
    color: var(--muted);
    font-size: ${({ theme }) => theme.font.sm};
  }
`;

const Compare = styled.div`
  display: grid;
  gap: ${({ theme }) => theme.space.xs};

  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: ${({ theme }) => theme.space.sm};
  }
  .pair {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: ${({ theme }) => theme.space.xs};
  }
  .stack {
    position: relative;
  }
  .stack > :last-child {
    position: absolute;
    inset: 0;
  }
  figcaption {
    color: var(--muted);
    font-size: ${({ theme }) => theme.font.xs};
    margin-top: 0.125rem;
  }
  figure {
    margin: 0;
  }
`;

const PROOF_GLYPH: Record<ProofOutcome | 'absent', { glyph: GlyphKind; text: string }> = {
  passed: { glyph: 'passed', text: 'Passed' },
  failed: { glyph: 'failed', text: 'Failed' },
  'not-run': { glyph: 'not-run', text: 'Not run' },
  unsupported: { glyph: 'gap', text: 'Unsupported' },
  absent: { glyph: 'not-run', text: 'Not recorded' }
};

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export interface ItemGalleryProps {
  bundleId: string;
  subject: { id: string; kind: SubjectKind };
  rows: MatrixRow[];
  choices: DimensionChoice[];
  columns: MatrixColumn[];
  chosenColumns: MatrixColumn[];
  detail: ItemDetail;
  onPickDimension: (name: string, value: string) => void;
  onPickItem: (id: string) => void;
  onPickAdapters: (ids: string[]) => void;
}

/**
 * One required item, seen across its reference and any number of recorded implementations. Dimensions are
 * filters that pick the item; the implementations shown are data, never invented.
 */
export function ItemGallery(props: ItemGalleryProps): ReactNode {
  const { detail } = props;
  return (
    <>
      <ItemControls {...props} />
      <Cards role="group" aria-label="Reference and implementations">
        <ReferencePreview reference={detail.reference} itemLabel={detail.row.label} />
        {detail.adapters.map((card) => (
          <AdapterPreview key={card.column.id} card={card} itemLabel={detail.row.label} href={card.comparison ? paths.comparison(props.bundleId, props.subject.kind, props.subject.id, card.comparison.id) : undefined} />
        ))}
      </Cards>
      <Lower>
        <VerificationDetails detail={detail} />
        <InlineCompare detail={detail} bundleId={props.bundleId} subject={props.subject} />
      </Lower>
    </>
  );
}

function ItemControls({ rows, choices, columns, chosenColumns, detail, onPickDimension, onPickItem, onPickAdapters }: ItemGalleryProps): ReactNode {
  const chosenIds = chosenColumns.map((column) => column.id);
  const toggle = (id: string): void => {
    const next = chosenIds.includes(id) ? chosenIds.filter((entry) => entry !== id) : columns.filter((column) => chosenIds.includes(column.id) || column.id === id).map((column) => column.id);
    // At least one implementation always stays shown.
    if (next.length > 0) {
      onPickAdapters(next.length === columns.length ? [] : next);
    }
  };

  return (
    <Controls role="group" aria-label="Choose the required item">
      {choices.map((choice) => (
        <label key={choice.name}>
          {titleCase(choice.name)}
          <select value={detail.row.dimensions[choice.name] ?? ''} onChange={(event) => onPickDimension(choice.name, event.target.value)}>
            {choice.values.map((value) => (
              <option key={value} value={value}>
                {value === NO_DIMENSION_VALUE ? '(none)' : value}
              </option>
            ))}
          </select>
        </label>
      ))}
      <label>
        Required item
        <select value={detail.row.requirement.id} onChange={(event) => onPickItem(event.target.value)}>
          {rows.map((row) => (
            <option key={row.requirement.id} value={row.requirement.id}>
              {row.label}
            </option>
          ))}
        </select>
      </label>
      {columns.length > 1 ? (
        <details>
          <summary>
            Show implementations: {chosenColumns.length === columns.length ? `all (${columns.length})` : `${chosenColumns.length} of ${columns.length}`}
          </summary>
          <div role="group" aria-label="Implementations">
            {columns.map((column) => (
              <label key={column.id}>
                <input type="checkbox" checked={chosenIds.includes(column.id)} onChange={() => toggle(column.id)} /> {column.label}
              </label>
            ))}
          </div>
        </details>
      ) : null}
    </Controls>
  );
}

// The reference has availability, source and approval. It is never given a pass or a fail.
function ReferencePreview({ reference, itemLabel }: { reference: ReferenceCard; itemLabel: string }): ReactNode {
  const caution = reference.attestation === 'agent' || reference.approval === 'lapsed';
  const availability = reference.availability === 'available' ? 'Available' : reference.availability === 'missing' ? 'Missing' : reference.availability === 'unmapped' ? 'Not mapped' : 'Unknown';
  return (
    <CardBox aria-label="Reference">
      <header>
        <h3>Reference</h3>
        <span className="meta">{availability}</span>
      </header>
      <ArtifactImage path={reference.artifactPath} alt={`${itemLabel}, reference`} emptyText={reference.availability === 'missing' ? 'No design to compare against' : 'No reference image'} />
      <div className="meta">
        {reference.source ?? 'Source not recorded'}
        {reference.capturedAt ? `, captured ${describeDate(reference.capturedAt)}` : ''}
        <br />
        <span className={caution ? 'caution' : undefined}>{describeApproval(reference)}</span>
      </div>
    </CardBox>
  );
}

function describeApproval(reference: ReferenceCard): string {
  if (reference.approval === 'holds') {
    if (reference.attestation === 'agent') return "▲ Recorded by an agent, no person's words";
    return reference.attestation === 'delegated' ? 'Approved by a person, written down by an agent' : 'Approved and recorded by a person';
  }
  if (reference.approval === 'lapsed') {
    return '▲ Approval lapsed';
  }
  return reference.approval === 'none' ? 'Not approved' : 'Approval not recorded';
}

function AdapterPreview({ card, itemLabel, href }: { card: AdapterCard; itemLabel: string; href: string | undefined }): ReactNode {
  const display = cellDisplay(card.outcome, card.unusable, card.superseded);
  return (
    <CardBox aria-label={card.column.label} $tone={card.outcome === 'failed' && !card.unusable ? 'fail' : undefined}>
      <header>
        <h3>
          {card.column.label}
          {card.required ? <span className="meta"> · required</span> : null}
        </h3>
        <span className="meta">
          <StatusLabel display={display} />
        </span>
      </header>
      <ArtifactImage path={card.artifactPath} alt={`${itemLabel}, ${card.column.label}`} emptyText={card.outcome === 'none' ? 'Not compared' : 'No image recorded'} />
      {card.accepted ? <div className="meta">{card.accepted === 'holds' ? 'Passes within a deviation the owner accepted' : '▲ The accepted deviation no longer holds'}</div> : null}
      <div className="meta">{href ? <a href={href}>Open comparison</a> : 'No comparison recorded for this item'}</div>
    </CardBox>
  );
}

function VerificationDetails({ detail }: { detail: ItemDetail }): ReactNode {
  const { row, facts } = detail;
  const status = READINESS_DISPLAY[row.readiness];
  return (
    <Panel aria-label="Verification details">
      <h3>Verification details</h3>
      <dl>
        <dt>Required item</dt>
        <dd>{row.label}</dd>
        <dt>Status</dt>
        <dd>
          <StatusLabel display={status} />
          {row.reason || row.detail ? <div className="reason">{row.detail ?? row.reason}</div> : null}
          {detail.requiredNotCompared.length > 0 ? (
            <div className="reason">Not proven until each required implementation passes. Not compared in: {detail.requiredNotCompared.join(', ')}.</div>
          ) : null}
          {detail.otherNotCompared.length > 0 && row.readiness !== 'needs-design' && row.readiness !== 'not-enrolled' ? (
            <div className="reason">Not compared in: {detail.otherNotCompared.join(', ')}. The status covers only what was compared.</div>
          ) : null}
        </dd>
        <dt>Viewports</dt>
        <dd>{facts.viewports.length > 0 ? facts.viewports.join(', ') : 'Not recorded'}</dd>
        <dt>Recorded threshold</dt>
        <dd>{facts.threshold.length > 0 ? facts.threshold.map((entry) => `${entry.name} ${entry.value}`).join(', ') : 'Not recorded'}</dd>
        <dt>Run finished</dt>
        <dd>{describeDate(facts.runFinishedAt)}</dd>
        <dt>Reference captured</dt>
        <dd>{describeDate(detail.reference.capturedAt)}</dd>
        <dt>Comparisons</dt>
        <dd>
          {facts.comparisonsPassed} of {facts.comparisonsExecuted} executed passed
        </dd>
      </dl>
      <table aria-label="Required proofs by implementation">
        <thead>
          <tr>
            <th scope="col">Implementation</th>
            {row.requirement.requiredProofs.map((layer) => (
              <th key={layer} scope="col">
                {titleCase(layer)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {detail.layerRows.map((layerRow) => (
            <tr key={layerRow.column.id}>
              <th scope="row">{layerRow.column.label}</th>
              {layerRow.layers.map(({ layer, outcome }) => (
                <td key={layer}>
                  <StatusGlyph kind={PROOF_GLYPH[outcome].glyph} label={PROOF_GLYPH[outcome].text} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}

type CompareMode = 'side-by-side' | 'overlay';

// A light pairwise view: the reference against one implementation. The full comparison view has the rest.
function InlineCompare({ detail, bundleId, subject }: { detail: ItemDetail; bundleId: string; subject: { id: string; kind: SubjectKind } }): ReactNode {
  const candidates = detail.adapters.filter((card) => card.comparison && card.artifactPath);
  const initial = candidates.find((card) => card.outcome === 'failed') ?? candidates[0];
  const [chosenId, setChosenId] = useState<string | undefined>(undefined);
  const [mode, setMode] = useState<CompareMode>('side-by-side');
  const [opacity, setOpacity] = useState(50);
  const card = candidates.find((entry) => entry.column.id === chosenId) ?? initial;

  if (!card || !detail.reference.artifactPath) {
    return (
      <Panel aria-label="Visual comparison">
        <h3>Visual comparison</h3>
        <p className="reason">A comparison needs both a reference image and an implementation image. This item does not have both.</p>
      </Panel>
    );
  }

  const alt = `${detail.row.label}, ${card.column.label}`;
  return (
    <Panel aria-label="Visual comparison">
      <h3>Visual comparison</h3>
      <Compare>
        <div className="row">
          {candidates.length > 1 ? (
            <label>
              Implementation{' '}
              <select value={card.column.id} onChange={(event) => setChosenId(event.target.value)}>
                {candidates.map((entry) => (
                  <option key={entry.column.id} value={entry.column.id}>
                    {entry.column.label}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <span>{card.column.label}</span>
          )}
          <Segmented role="group" aria-label="Comparison mode">
            <button type="button" aria-pressed={mode === 'side-by-side'} onClick={() => setMode('side-by-side')}>
              Side by side
            </button>
            <button type="button" aria-pressed={mode === 'overlay'} onClick={() => setMode('overlay')}>
              Overlay
            </button>
          </Segmented>
          {mode === 'overlay' ? (
            <label>
              Implementation opacity{' '}
              <input type="range" min={0} max={100} value={opacity} onChange={(event) => setOpacity(Number(event.target.value))} />
            </label>
          ) : null}
        </div>
        {mode === 'side-by-side' ? (
          <div className="pair">
            <figure>
              <ArtifactImage path={detail.reference.artifactPath} alt={`${alt}, reference`} />
              <figcaption>Reference</figcaption>
            </figure>
            <figure>
              <ArtifactImage path={card.artifactPath} alt={`${alt}, implementation`} />
              <figcaption>{card.column.label}</figcaption>
            </figure>
          </div>
        ) : (
          <div className="stack">
            <ArtifactImage path={detail.reference.artifactPath} alt={`${alt}, reference`} />
            <div style={{ opacity: opacity / 100 }}>
              <ArtifactImage path={card.artifactPath} alt={`${alt}, implementation`} />
            </div>
          </div>
        )}
        {card.comparison ? <a href={paths.comparison(bundleId, subject.kind, subject.id, card.comparison.id)}>Open full comparison</a> : null}
      </Compare>
    </Panel>
  );
}
