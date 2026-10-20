import type { ReactNode } from 'react';
import styled from 'styled-components';
import { pageChecks } from '../../model/gallery-model';
import { presentRows, type PresentedSection } from '../../model/presentation';
import type { Comparison, Presentation } from 'reflection-projection';
import { joinDimensions } from '../../model/format';
import type { MatrixColumn, MatrixRow } from '../../model/matrix-model';
import { paths, type SubjectKind } from '../../routes/paths';
import { ArtifactImage } from '../atoms/artifact-image';
import { Button } from '../atoms/button';
import { cellDisplay, READINESS_DISPLAY, StatusLabel } from '../atoms/outcome-status';
import { StatusGlyph } from '../atoms/status-glyph';

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 18rem), 1fr));
  gap: ${({ theme }) => theme.space.sm};
`;

const Check = styled.article<{ $failed: boolean }>`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space.xs};
  padding: ${({ theme }) => theme.space.sm};
  background: var(--surface);
  border: 1px solid ${({ $failed }) => ($failed ? 'color-mix(in srgb, var(--fail) 45%, transparent)' : 'var(--border)')};
  border-radius: ${({ theme }) => theme.radius.lg};

  header {
    display: flex;
    justify-content: space-between;
    gap: ${({ theme }) => theme.space.xs};
  }
  h3 {
    margin: 0;
    font-size: ${({ theme }) => theme.font.md};
  }
  .meta {
    color: var(--muted);
    font-size: ${({ theme }) => theme.font.xs};
  }
  .impls {
    display: flex;
    flex-wrap: wrap;
    gap: ${({ theme }) => theme.space.sm};
    font-size: ${({ theme }) => theme.font.sm};
  }
  .impls span {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
  }
`;

const Heading = styled.h2`
  margin: 0 0 ${({ theme }) => theme.space.xxs};
  font-size: ${({ theme }) => theme.font.lg};
`;

const Note = styled.p`
  color: var(--muted);
  font-size: ${({ theme }) => theme.font.sm};
`;

export interface PageChecksProps {
  bundleId: string;
  subject: { id: string; kind: SubjectKind };
  // Failures and unproven items first.
  rows: MatrixRow[];
  // Requirement ids in the order the provider listed them, which a presentation hint keeps.
  providerOrder: string[];
  presentation: Presentation | undefined;
  columns: MatrixColumn[];
  onShowAll: () => void;
}

const Sections = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space.md};
  margin-top: ${({ theme }) => theme.space.md};

  h3 {
    margin: 0 0 ${({ theme }) => theme.space.xs};
    font-size: ${({ theme }) => theme.font.md};
  }
`;

const Groups = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 21rem), 1fr));
  gap: ${({ theme }) => theme.space.sm};
`;

const Group = styled.article`
  padding: ${({ theme }) => theme.space.sm};
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: ${({ theme }) => theme.radius.lg};
  min-width: 0;

  h4 {
    margin: 0 0 ${({ theme }) => theme.space.xs};
    font-size: ${({ theme }) => theme.font.sm};
    overflow-wrap: anywhere;
  }
  .cells {
    display: grid;
    grid-template-columns: repeat(var(--columns), minmax(0, 1fr));
    gap: ${({ theme }) => theme.space.xs};
  }
  .cell {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    min-width: 0;
    font-size: ${({ theme }) => theme.font.xs};
  }
  .cell.failed {
    outline: 2px solid color-mix(in srgb, var(--fail) 55%, transparent);
    outline-offset: 2px;
    border-radius: ${({ theme }) => theme.radius.sm};
  }
  .cell.unproven {
    outline: 2px dashed var(--border-strong);
    outline-offset: 2px;
    border-radius: ${({ theme }) => theme.radius.sm};
  }
  .cell .status {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }
  .meta {
    color: var(--muted);
  }
`;

/**
 * The recorded states and viewports of a page. These are whole-page captures, so they are shown as what was
 * recorded, not as element-level coverage. A few are shown, failures and unproven items first, and the full
 * inventory is one click away.
 */
export function PageChecks({ bundleId, subject, rows, providerOrder, presentation, columns, onShowAll }: PageChecksProps): ReactNode {
  const sections = presentRows(inOrder(rows, providerOrder), presentation);
  if (sections) {
    return <PresentedChecks bundleId={bundleId} subject={subject} rows={rows} sections={sections} />;
  }
  const { shown, total } = pageChecks(rows);
  if (shown.length === 0) {
    return <Note role="status">No page check has any recorded evidence yet. All {total} required items are listed under “All required items”.</Note>;
  }

  return (
    <>
      <Heading>Recorded page checks</Heading>
      <Note style={{ marginTop: 0 }}>Whole-page captures of each recorded state and viewport, not checks of the elements inside them.</Note>
      <Grid role="group" aria-label="Recorded page checks">
        {shown.map((row) => (
          <CheckCard key={row.requirement.id} bundleId={bundleId} subject={subject} row={row} columns={columns} />
        ))}
      </Grid>
      <Note>
        Showing {shown.length} of {total} required items, failures and unproven items first.{' '}
        <Button type="button" onClick={onShowAll}>
          View all {total} required items
        </Button>
      </Note>
    </>
  );
}

// The comparison a check opens: a failing one when there is one, else the first recorded.
function primaryOf(row: MatrixRow): Comparison | undefined {
  return [...row.cells.values()].find((cell) => cell.outcome === 'failed')?.primary ?? [...row.cells.values()].find((cell) => cell.primary)?.primary;
}

function CheckCard({ bundleId, subject, row, columns }: { bundleId: string; subject: { id: string; kind: SubjectKind }; row: MatrixRow; columns: MatrixColumn[] }): ReactNode {
  const primary = primaryOf(row);
  const display = READINESS_DISPLAY[row.readiness];
  return (
    <Check $failed={row.group === 'failed'} aria-label={row.label}>
      <header>
        <h3>{row.label}</h3>
        <StatusLabel display={display} />
      </header>
      <div className="meta">{joinDimensions(row.dimensions)}</div>
      <ArtifactImage path={primary?.actual?.path} alt={`${row.label}, recorded capture`} aspect="4 / 3" />
      {columns.length > 1 || columns[0]?.id !== '' ? (
        <div className="impls">
          {columns.map((column) => {
            const cell = row.cells.get(column.id);
            const status = cellDisplay(cell?.outcome ?? 'none', cell?.unusable ?? false, cell?.superseded ?? false);
            return (
              <span key={column.id}>
                <StatusGlyph kind={status.glyph} label={`${column.label}: ${status.text}`} />
                {column.label}
              </span>
            );
          })}
        </div>
      ) : null}
      {primary ? <a href={paths.comparison(bundleId, subject.kind, subject.id, primary.id)}>Open comparison</a> : <span className="meta">No comparison recorded</span>}
    </Check>
  );
}

function inOrder(rows: MatrixRow[], providerOrder: string[]): MatrixRow[] {
  const position = new Map(providerOrder.map((id, index) => [id, index]));
  return [...rows].sort((a, b) => (position.get(a.requirement.id) ?? Infinity) - (position.get(b.requirement.id) ?? Infinity));
}

/**
 * Every item, laid out the way the provider asked: each section with one row per group and its columns side by
 * side, so a reviewer can scan the whole page at once. Groups with a failing or unproven item come first and those
 * cells are outlined.
 */
function PresentedChecks({ bundleId, subject, rows, sections }: { bundleId: string; subject: { id: string; kind: SubjectKind }; rows: MatrixRow[]; sections: PresentedSection[] }): ReactNode {
  const failing = rows.filter((row) => row.group === 'failed').length;
  const unproven = rows.filter((row) => row.group === 'not-proven').length;
  return (
    <>
      <Heading>Recorded page checks</Heading>
      <Note style={{ marginTop: 0 }}>
        Whole-page captures of each recorded state and viewport, not checks of the elements inside them. All {rows.length} required items, laid out as the provider describes them
        {failing + unproven > 0 ? `; ${[failing > 0 ? `${failing} failing` : '', unproven > 0 ? `${unproven} not proven` : ''].filter(Boolean).join(' and ')} first in each section` : ''}.
      </Note>
      <Sections>
        {sections.map((section) => (
          <section key={section.title ?? ''} aria-label={section.title ?? 'All checks'}>
            {section.title ? <h3>{section.title}</h3> : null}
            <Groups>
              {section.groups.map((group) => (
                <Group key={group.key} aria-label={group.key || 'Other'} style={{ ['--columns' as string]: Math.max(1, section.columns.length) }}>
                  <h4>{group.key || 'Other'}</h4>
                  <div className="cells">
                    {group.cells.map((cell) => (
                      <PresentedCell key={cell.column} bundleId={bundleId} subject={subject} column={cell.column} rows={cell.rows} />
                    ))}
                  </div>
                </Group>
              ))}
            </Groups>
          </section>
        ))}
      </Sections>
    </>
  );
}

function PresentedCell({ bundleId, subject, column, rows }: { bundleId: string; subject: { id: string; kind: SubjectKind }; column: string; rows: MatrixRow[] }): ReactNode {
  if (rows.length === 0) {
    return (
      <div className="cell">
        <span className="meta">{column || 'Item'}</span>
        <span className="meta">Not required</span>
      </div>
    );
  }
  return (
    <>
      {rows.map((row) => {
        const primary = primaryOf(row);
        const display = READINESS_DISPLAY[row.readiness];
        const image = <ArtifactImage path={primary?.actual?.path} alt={`${row.label}, recorded capture`} aspect="4 / 3" emptyText="No comparison recorded" />;
        return (
          <div className={`cell${row.group === 'failed' ? ' failed' : row.group === 'not-proven' ? ' unproven' : ''}`} key={row.requirement.id}>
            <span className="status">
              <StatusGlyph kind={display.glyph} label={display.text} />
              {column || row.label}
            </span>
            {primary ? (
              <a href={paths.comparison(bundleId, subject.kind, subject.id, primary.id)} aria-label={`${row.label}: ${display.text}. Open comparison`}>
                {image}
              </a>
            ) : (
              image
            )}
          </div>
        );
      })}
    </>
  );
}
