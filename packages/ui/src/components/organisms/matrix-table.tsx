import { useState, type ReactNode } from 'react';
import styled from 'styled-components';
import { joinDimensions } from '../../model/format';
import type { Matrix, MatrixCell, MatrixColumn, MatrixGroup, MatrixRow, ReferenceSummary } from '../../model/matrix-model';
import { cellDisplay } from '../atoms/outcome-status';
import { StatusGlyph } from '../atoms/status-glyph';
import { Thumbnail } from '../atoms/thumbnail';
import { OUTCOME_TITLES, type Density } from '../molecules/filter-bar';

const ROW_HEIGHT: Record<Density, string> = { comfortable: '3.5rem', compact: '2.5rem', 'status-only': '2rem' };
const LONG_GROUP = 40;

const Wrap = styled.div`
  border: 1px solid var(--border);
  border-radius: ${({ theme }) => theme.radius.lg};
  background: var(--surface);
  overflow: clip;
`;

const Table = styled.table<{ $density: Density }>`
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  --row-height: ${({ $density }) => ROW_HEIGHT[$density]};

  th,
  td {
    padding: ${({ theme }) => theme.space.xxs} ${({ theme }) => theme.space.sm};
    border-bottom: 1px solid var(--border);
    text-align: left;
    vertical-align: middle;
  }
  thead th {
    position: sticky;
    top: 0;
    z-index: 5;
    background: var(--surface-2);
    color: var(--muted);
    font-size: ${({ theme }) => theme.font.xs};
    font-weight: 550;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    height: 2.375rem;
  }
  tbody tr.item td,
  tbody tr.item th {
    height: var(--row-height);
    background: var(--surface);
  }
  tbody tr.item td {
    height: var(--row-height);
    background: var(--surface);
  }
  tbody tr.item:hover td {
    background: var(--surface-2);
  }
  th[scope='row'] {
    font-weight: 400;
  }
  td.identity,
  th.identity {
    position: sticky;
    left: 0;
    z-index: 2;
    min-width: 16rem;
    background: inherit;
  }
  td.reference,
  th.reference {
    min-width: 11rem;
    border-right: 1px solid var(--border);
  }
`;

const GROUP_ACCENT: Record<MatrixGroup['id'], string> = {
  failed: 'var(--fail)',
  'not-proven': 'var(--gap)',
  passed: 'var(--pass)',
  missing: 'var(--border-strong)'
};

const GroupButton = styled.button<{ $group: MatrixGroup['id'] }>`
  display: flex;
  align-items: baseline;
  gap: ${({ theme }) => theme.space.sm};
  width: 100%;
  min-height: 2.75rem;
  padding: ${({ theme }) => theme.space.xs} ${({ theme }) => theme.space.sm} ${({ theme }) => theme.space.xs} ${({ theme }) => theme.space.xs};
  border: 0;
  border-left: 3px solid ${({ $group }) => GROUP_ACCENT[$group]};
  background: ${({ $group }) => ($group === 'failed' ? 'var(--fail-bg)' : 'var(--surface-2)')};
  text-align: left;

  .title {
    font-weight: 650;
  }
  .count {
    font-variant-numeric: tabular-nums;
    padding: 0 0.5rem;
    border-radius: ${({ theme }) => theme.radius.pill};
    background: var(--surface);
    border: 1px solid var(--border);
    font-size: ${({ theme }) => theme.font.xs};
  }
  .why {
    font-weight: 400;
    color: var(--muted);
    font-size: ${({ theme }) => theme.font.sm};
  }
  .caret {
    color: var(--muted);
    width: 0.875rem;
  }
  .hint {
    margin-left: auto;
    color: var(--muted);
    font-size: ${({ theme }) => theme.font.xs};
  }
`;

const Label = styled.div`
  font-weight: 550;
`;

const Dimensions = styled.div`
  color: var(--muted);
  font-size: ${({ theme }) => theme.font.xs};
  white-space: nowrap;
`;

const Detail = styled.div`
  color: var(--muted);
  font-size: ${({ theme }) => theme.font.xs};
  max-width: 22rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

// An approval nobody confirmed (recorded by an agent, or lapsed) is a trust fact, so it is shown in warning colour.
const CommonReference = styled.div<{ $caution: boolean }>`
  font-weight: ${({ $caution }) => ($caution ? 600 : 400)};
  text-transform: none;
  letter-spacing: 0;
  font-size: ${({ theme }) => theme.font.xs};
  color: ${({ $caution }) => ($caution ? 'var(--gap)' : 'var(--text)')};
`;

const Small = styled.div<{ $caution?: boolean }>`
  color: ${({ $caution }) => ($caution ? 'var(--gap)' : 'var(--muted)')};
  font-weight: ${({ $caution }) => ($caution ? 600 : 400)};
  font-size: ${({ theme }) => theme.font.xs};
`;

const CellLink = styled.a<{ $failed: boolean }>`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space.sm};
  min-height: calc(var(--row-height) - 0.75rem);
  padding: 0.125rem ${({ theme }) => theme.space.xs};
  border: 1px solid ${({ $failed }) => ($failed ? 'color-mix(in srgb, var(--fail) 40%, transparent)' : 'transparent')};
  background: ${({ $failed }) => ($failed ? 'var(--fail-bg)' : 'none')};
  border-radius: ${({ theme }) => theme.radius.md};
  color: inherit;
  text-decoration: none;

  &:hover {
    border-color: var(--border);
  }
`;

const Dashed = styled.span`
  display: inline-flex;
  white-space: nowrap;
  align-items: center;
  gap: ${({ theme }) => theme.space.xs};
  color: var(--muted);
  font-size: ${({ theme }) => theme.font.sm};
  border: 1px dashed var(--border-strong);
  border-radius: ${({ theme }) => theme.radius.md};
  padding: 0.125rem ${({ theme }) => theme.space.xs};
`;

export interface MatrixTableProps {
  matrix: Matrix;
  comparisonHref: (comparisonId: string) => string;
  density: Density;
  filtersActive: boolean;
}

export function MatrixTable({ matrix, comparisonHref, density, filtersActive }: MatrixTableProps): ReactNode {
  const [toggled, setToggled] = useState<Partial<Record<MatrixGroup['id'], boolean>>>({});
  const columnCount = 2 + matrix.columns.length;

  const isOpen = (group: MatrixGroup): boolean => toggled[group.id] ?? defaultOpen(group, filtersActive);

  return (
    <Wrap>
      <Table $density={density}>
        <thead>
          <tr>
            <th className="identity" scope="col">
              Item
            </th>
            <th className="reference" scope="col">
              Reference
              {matrix.commonReference ? (
                <CommonReference $caution={false}>{matrix.commonReference.source ?? 'One reference source'}, for every item</CommonReference>
              ) : null}
            </th>
            {matrix.columns.map((column) => (
              <th key={column.id} scope="col">
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        {matrix.groups
          .filter((group) => group.rows.length > 0)
          .map((group) => {
            const open = isOpen(group);
            return (
              <tbody key={group.id} aria-label={OUTCOME_TITLES[group.id]}>
                <tr>
                  <th colSpan={columnCount} scope="colgroup" style={{ padding: 0 }}>
                    <GroupButton $group={group.id} type="button" aria-expanded={open} onClick={() => setToggled((state) => ({ ...state, [group.id]: !open }))}>
                      <span className="caret" aria-hidden="true">
                        {open ? '▾' : '▸'}
                      </span>
                      <span className="title">{OUTCOME_TITLES[group.id]}</span>
                      <span className="count">{group.rows.length}</span>
                      <span className="why">{describeGroup(group)}</span>
                      {open ? null : <span className="hint">Show {group.rows.length}</span>}
                    </GroupButton>
                  </th>
                </tr>
                {open ? group.rows.map((row) => <ItemRow key={row.requirement.id} row={row} columns={matrix.columns} comparisonHref={comparisonHref} density={density} />) : null}
              </tbody>
            );
          })}
      </Table>
    </Wrap>
  );
}

function defaultOpen(group: MatrixGroup, filtersActive: boolean): boolean {
  if (filtersActive) {
    return true;
  }
  if (group.id === 'missing') {
    return false;
  }
  return group.id !== 'passed' || group.rows.length <= LONG_GROUP;
}

function describeGroup(group: MatrixGroup): string {
  if (group.id === 'missing') {
    return group.reasons.map((entry) => `${entry.count} ${entry.reason.toLowerCase()}`).join(' · ');
  }
  if (group.id === 'not-proven') {
    const reasons = new Map<string, number>();
    for (const row of group.rows) {
      reasons.set(row.reason ?? 'Not proven', (reasons.get(row.reason ?? 'Not proven') ?? 0) + 1);
    }
    return [...reasons.entries()].map(([reason, count]) => `${count} ${reason.toLowerCase()}`).join(' · ');
  }
  return '';
}

function ItemRow({ row, columns, comparisonHref, density }: { row: MatrixRow; columns: MatrixColumn[]; comparisonHref: (comparisonId: string) => string; density: Density }): ReactNode {
  return (
    <tr className="item">
      <th className="identity" scope="row">
        <Label>{row.label}</Label>
        <Dimensions>{joinDimensions(row.dimensions)}</Dimensions>
        {row.detail ? <Detail title={row.detail}>{row.detail}</Detail> : null}
      </th>
      <td className="reference">
        <ReferenceCell row={row} />
      </td>
      {columns.map((column) => {
        const cell = row.cells.get(column.id);
        return (
          <td key={column.id}>
            {cell ? <ResultCell cell={cell} row={row} column={column} comparisonHref={comparisonHref} density={density} /> : null}
          </td>
        );
      })}
    </tr>
  );
}

function isCaution(reference: ReferenceSummary): boolean {
  return reference.attestation === 'agent' || reference.approval === 'lapsed';
}

// The reference has availability and a source, never a verdict. Every row says its own approval, so one that
// lapsed or was only recorded by an agent stands out; a row whose source differs from the header also names it.
function ReferenceCell({ row }: { row: MatrixRow }): ReactNode {
  const { reference } = row;
  if (reference.availability === 'missing') {
    return <Dashed>Missing</Dashed>;
  }
  if (reference.availability === 'unmapped') {
    return <Dashed>Not mapped</Dashed>;
  }
  const approval = (
    <Small $caution={isCaution(reference)}>
      {isCaution(reference) ? '▲ ' : ''}
      {describeApproval(reference) || 'Approval not recorded'}
    </Small>
  );
  if (row.referenceIsCommon) {
    return approval;
  }
  return (
    <div>
      <div>{reference.source ?? (reference.availability === 'available' ? 'Available' : 'Unknown')}</div>
      {approval}
    </div>
  );
}

function describeApproval(reference: ReferenceSummary): string {
  if (reference.approval === 'holds') {
    if (reference.attestation === 'agent') return "Recorded by an agent, no person's words";
    return reference.attestation === 'delegated' ? 'Approved by a person, written down by an agent' : 'Approved and recorded by a person';
  }
  if (reference.approval === 'lapsed') {
    return 'Approval no longer matches the reference';
  }
  return reference.approval === 'none' ? 'Not approved' : '';
}

function ResultCell({ cell, row, column, comparisonHref, density }: { cell: MatrixCell; row: MatrixRow; column: MatrixColumn; comparisonHref: (comparisonId: string) => string; density: Density }): ReactNode {
  const { glyph, text } = cellDisplay(cell.outcome, cell.unusable);
  const more = cell.comparisons.length > 1 ? ` (${cell.comparisons.length} comparisons)` : '';

  if (!cell.primary) {
    return (
      <Dashed>
        <StatusGlyph kind={glyph} label={text} />
        {density === 'status-only' ? null : text}
      </Dashed>
    );
  }

  const imagePath = cell.primary.actual?.path;
  return (
    <CellLink
      href={comparisonHref(cell.primary.id)}
      $failed={cell.outcome === 'failed' && !cell.unusable}
      aria-label={`${row.label}, ${column.label}: ${text}${more}`}
      title={`${text}${more}`}
    >
      {density === 'comfortable' && imagePath ? <Thumbnail path={imagePath} alt={`${row.label} ${column.label}`} /> : null}
      <StatusGlyph kind={glyph} label={text} />
      {density === 'comfortable' ? null : density === 'compact' ? <span>{text}</span> : null}
    </CellLink>
  );
}
