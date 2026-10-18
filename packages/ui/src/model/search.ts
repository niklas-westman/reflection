import type { Density } from '../components/molecules/filter-bar';
import { NO_FILTERS, parseOutcomeList, type MatrixFilters } from './filters';

export interface SubjectView {
  filters: MatrixFilters;
  density: Density;
}

const DENSITIES: readonly Density[] = ['comfortable', 'compact', 'status-only'];

/** The view a URL describes. Anything unrecognised falls back to the default, so a hand-edited link never breaks the page. */
export function parseSubjectSearch(raw: Record<string, unknown>): SubjectView {
  const density = DENSITIES.find((entry) => entry === raw.density) ?? 'comfortable';
  const dimensions: Record<string, string[]> = {};
  if (raw.dims !== null && typeof raw.dims === 'object') {
    for (const [name, values] of Object.entries(raw.dims)) {
      if (Array.isArray(values)) {
        dimensions[name] = values.filter((value): value is string => typeof value === 'string');
      }
    }
  }
  return {
    filters: { search: typeof raw.q === 'string' ? raw.q : '', outcomes: parseOutcomeList(raw.outcome), dimensions },
    density
  };
}

/** The URL for a view, leaving out everything that is still the default. */
export function toSubjectSearch(view: SubjectView): Record<string, unknown> {
  const search: Record<string, unknown> = {};
  if (view.filters.search !== NO_FILTERS.search) search.q = view.filters.search;
  if (view.filters.outcomes.length > 0) search.outcome = view.filters.outcomes.join(',');
  const dimensions = Object.fromEntries(Object.entries(view.filters.dimensions).filter(([, values]) => values.length > 0));
  if (Object.keys(dimensions).length > 0) search.dims = dimensions;
  if (view.density !== 'comfortable') search.density = view.density;
  return search;
}
