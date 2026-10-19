import type { Density } from '../components/molecules/filter-bar';
import { NO_FILTERS, parseOutcomeList, type MatrixFilters } from './filters';

export type SubjectViewMode = 'gallery' | 'items' | 'changes';

export interface SubjectView {
  mode: SubjectViewMode;
  // The required item shown in the gallery. Absent: the one that most needs attention.
  item: string | undefined;
  // Implementations shown in the gallery. Absent: all of them.
  adapters: string[] | undefined;
  filters: MatrixFilters;
  density: Density;
}

const DENSITIES: readonly Density[] = ['comfortable', 'compact', 'status-only'];
const MODES: readonly SubjectViewMode[] = ['gallery', 'items', 'changes'];

export const DEFAULT_SUBJECT_VIEW: SubjectView = { mode: 'gallery', item: undefined, adapters: undefined, filters: NO_FILTERS, density: 'comfortable' };

/** The view a URL describes. Anything unrecognised falls back to the default, so a hand-edited link never breaks the page. */
export function parseSubjectSearch(raw: Record<string, unknown>): SubjectView {
  const density = DENSITIES.find((entry) => entry === raw.density) ?? 'comfortable';
  const mode = MODES.find((entry) => entry === raw.view) ?? 'gallery';
  const dimensions: Record<string, string[]> = {};
  if (raw.dims !== null && typeof raw.dims === 'object') {
    for (const [name, values] of Object.entries(raw.dims)) {
      if (Array.isArray(values)) {
        dimensions[name] = values.filter((value): value is string => typeof value === 'string');
      }
    }
  }
  const adapters = typeof raw.adapters === 'string' && raw.adapters !== '' ? raw.adapters.split(',') : undefined;
  return {
    mode,
    item: typeof raw.item === 'string' && raw.item !== '' ? raw.item : undefined,
    adapters,
    filters: { search: typeof raw.q === 'string' ? raw.q : '', outcomes: parseOutcomeList(raw.outcome), dimensions },
    density
  };
}

/** The URL for a view, leaving out everything that is still the default. */
export function toSubjectSearch(view: SubjectView): Record<string, unknown> {
  const search: Record<string, unknown> = {};
  if (view.mode !== 'gallery') search.view = view.mode;
  if (view.item !== undefined) search.item = view.item;
  if (view.adapters !== undefined) search.adapters = view.adapters.join(',');
  if (view.filters.search !== NO_FILTERS.search) search.q = view.filters.search;
  if (view.filters.outcomes.length > 0) search.outcome = view.filters.outcomes.join(',');
  const dimensions = Object.fromEntries(Object.entries(view.filters.dimensions).filter(([, values]) => values.length > 0));
  if (Object.keys(dimensions).length > 0) search.dims = dimensions;
  if (view.density !== 'comfortable') search.density = view.density;
  return search;
}
