import { countReasons, OUTCOME_GROUP_ORDER, type Matrix, type MatrixRow, type OutcomeGroupId } from './matrix-model';

export interface MatrixFilters {
  search: string;
  outcomes: OutcomeGroupId[];
  // Dimension name to the values to keep. A row must match every named dimension.
  dimensions: Record<string, string[]>;
}

export const NO_FILTERS: MatrixFilters = { search: '', outcomes: [], dimensions: {} };

export function hasActiveFilters(filters: MatrixFilters): boolean {
  return filters.search.trim() !== '' || filters.outcomes.length > 0 || Object.values(filters.dimensions).some((values) => values.length > 0);
}

export function rowMatches(row: MatrixRow, filters: MatrixFilters): boolean {
  if (filters.outcomes.length > 0 && !filters.outcomes.includes(row.group)) {
    return false;
  }
  for (const [name, values] of Object.entries(filters.dimensions)) {
    if (values.length > 0 && !values.includes(row.dimensions[name] ?? '')) {
      return false;
    }
  }
  const search = filters.search.trim().toLowerCase();
  if (search === '') {
    return true;
  }
  const haystack = [row.label, row.requirement.id, ...Object.values(row.dimensions)].join(' ').toLowerCase();
  return haystack.includes(search);
}

/** Drops rows that do not match. Group totals before filtering are kept by the caller from the unfiltered matrix. */
export function filterMatrix(matrix: Matrix, filters: MatrixFilters): Matrix {
  return {
    columns: matrix.columns,
    commonReference: matrix.commonReference,
    groups: matrix.groups.map((group) => {
      const rows = group.rows.filter((row) => rowMatches(row, filters));
      return { ...group, rows, reasons: group.id === 'missing' ? countReasons(rows) : [] };
    })
  };
}

/** The values each dimension takes across the matrix, for the filter menu. Only dimensions with a choice are listed. */
export function availableDimensions(matrix: Matrix): Array<{ name: string; values: string[] }> {
  const values = new Map<string, Set<string>>();
  for (const group of matrix.groups) {
    for (const row of group.rows) {
      for (const [name, value] of Object.entries(row.dimensions)) {
        values.set(name, (values.get(name) ?? new Set()).add(value));
      }
    }
  }
  return [...values.entries()]
    .filter(([, set]) => set.size > 1)
    .map(([name, set]) => ({ name, values: [...set].sort() }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function parseOutcomeList(value: unknown): OutcomeGroupId[] {
  if (typeof value !== 'string') {
    return [];
  }
  return value.split(',').filter((part): part is OutcomeGroupId => (OUTCOME_GROUP_ORDER as readonly string[]).includes(part));
}
