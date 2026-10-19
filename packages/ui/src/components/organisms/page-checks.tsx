import type { ReactNode } from 'react';
import styled from 'styled-components';
import { pageChecks } from '../../model/gallery-model';
import { joinDimensions } from '../../model/format';
import type { MatrixColumn, MatrixRow } from '../../model/matrix-model';
import { paths, type SubjectKind } from '../../routes/paths';
import { ArtifactImage } from '../atoms/artifact-image';
import { Button } from '../atoms/button';
import { cellDisplay, READINESS_DISPLAY, StatusLabel } from '../atoms/outcome-status';
import { StatusGlyph } from '../atoms/status-glyph';

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(18rem, 1fr));
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
  rows: MatrixRow[];
  columns: MatrixColumn[];
  onShowAll: () => void;
}

/**
 * The recorded states and viewports of a page. These are whole-page captures, so they are shown as what was
 * recorded, not as element-level coverage. A few are shown, failures and unproven items first, and the full
 * inventory is one click away.
 */
export function PageChecks({ bundleId, subject, rows, columns, onShowAll }: PageChecksProps): ReactNode {
  const { shown, total } = pageChecks(rows);
  if (shown.length === 0) {
    return <Note role="status">No page check has any recorded evidence yet. All {total} required items are listed under “All required items”.</Note>;
  }

  return (
    <>
      <Heading>Recorded page checks</Heading>
      <Note style={{ marginTop: 0 }}>Whole-page captures of each recorded state and viewport, not checks of the elements inside them.</Note>
      <Grid role="group" aria-label="Recorded page checks">
        {shown.map((row) => {
          const primary = [...row.cells.values()].find((cell) => cell.outcome === 'failed')?.primary ?? [...row.cells.values()].find((cell) => cell.primary)?.primary;
          const display = READINESS_DISPLAY[row.readiness];
          return (
            <Check key={row.requirement.id} $failed={row.group === 'failed'} aria-label={row.label}>
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
                    const status = cellDisplay(cell?.outcome ?? 'none', cell?.unusable ?? false);
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
        })}
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
