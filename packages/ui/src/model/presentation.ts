import { subjectDimension, type Presentation } from 'reflection-projection';
import type { MatrixRow } from './matrix-model';

export interface PresentedGroup {
  // The value of the groupBy dimension, for example the state "request-code".
  key: string;
  // One entry per value of the columns dimension, in the order the section uses. Empty where no item has it;
  // more than one when items differ only in a dimension the hint does not name, so none is hidden.
  cells: Array<{ column: string; rows: MatrixRow[] }>;
}

export interface PresentedSection {
  // The value of the sections dimension, for example "email"; undefined when the hint names no sections.
  title: string | undefined;
  columns: string[];
  groups: PresentedGroup[];
}

const NONE = '';

/**
 * Every item of a subject laid out by the provider's hint: sections, then one group per groupBy value with the
 * columns side by side. Pass the rows in the provider's order; sections and columns keep it, and so do groups,
 * except that a group holding a failing item comes first, then one holding an unproven item. Undefined when the hint does not
 * apply (no groupBy, or no item has that dimension), so the caller keeps its default layout.
 */
export function presentRows(rows: MatrixRow[], presentation: Presentation | undefined): PresentedSection[] | undefined {
  const groupBy = presentation?.groupBy;
  if (!groupBy || !rows.some((row) => subjectDimension(row.requirement.subject, groupBy) !== undefined)) return undefined;
  const valueOf = (row: MatrixRow, key: string | undefined): string => (key ? (subjectDimension(row.requirement.subject, key) ?? NONE) : NONE);

  const sections = new Map<string, MatrixRow[]>();
  for (const row of rows) {
    const title = valueOf(row, presentation.sections);
    sections.set(title, [...(sections.get(title) ?? []), row]);
  }

  return [...sections.entries()].map(([title, sectionRows]) => {
    const columns = unique(sectionRows.map((row) => valueOf(row, presentation.columns)));
    const groups = unique(sectionRows.map((row) => valueOf(row, groupBy))).map((key) => ({
      key,
      cells: columns.map((column) => ({ column, rows: sectionRows.filter((row) => valueOf(row, groupBy) === key && valueOf(row, presentation.columns) === column) }))
    }));
    // Array.prototype.sort is stable, so groups of the same urgency keep the provider's order.
    groups.sort((a, b) => urgencyOf(a) - urgencyOf(b));
    return { title: title === NONE ? undefined : title, columns, groups };
  });
}

const URGENCY: Record<MatrixRow['group'], number> = { failed: 0, 'not-proven': 1, missing: 2, passed: 3 };

function urgencyOf(group: PresentedGroup): number {
  return Math.min(...group.cells.flatMap((cell) => cell.rows.map((row) => URGENCY[row.group])), URGENCY.passed);
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
