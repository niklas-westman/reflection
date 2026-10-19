import type { ItemChange, SubjectChange } from 'reflection-projection';

export type ChangeFilter = 'all' | 'added' | 'updated' | 'removed';

export interface ChangesView {
  kind: ChangeFilter;
  search: string;
}

export const FILTERS: readonly ChangeFilter[] = ['all', 'added', 'updated', 'removed'];

export function parseChangesSearch(raw: Record<string, unknown>): ChangesView {
  return { kind: FILTERS.find((entry) => entry === raw.kind) ?? 'all', search: typeof raw.q === 'string' ? raw.q : '' };
}

export function toChangesSearch(view: ChangesView): Record<string, unknown> {
  return { ...(view.kind !== 'all' ? { kind: view.kind } : {}), ...(view.search !== '' ? { q: view.search } : {}) };
}

/** Subjects whose catalog changed, filtered by kind and by a search over the subject and its changed items. */
export function visibleChanges(subjects: SubjectChange[], view: ChangesView, labelOf: (subject: SubjectChange) => string): SubjectChange[] {
  const needle = view.search.trim().toLowerCase();
  return subjects
    .filter((subject) => subject.change !== 'unchanged')
    .filter((subject) => view.kind === 'all' || subject.change === view.kind)
    .filter((subject) => needle === '' || [subject.id, labelOf(subject), ...subject.items.filter((item) => item.change !== 'unchanged').map((item) => item.label)].join(' ').toLowerCase().includes(needle));
}

/** The one item to show before and after on a card: a changed reference first, then an addition, then a removal. */
export function featuredItem(subject: SubjectChange): ItemChange | undefined {
  return (
    subject.items.find((item) => item.change === 'reference-changed') ??
    subject.items.find((item) => item.change === 'added') ??
    subject.items.find((item) => item.change === 'removed')
  );
}

export function changedItems(subject: SubjectChange): ItemChange[] {
  return subject.items.filter((item) => item.change !== 'unchanged');
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** "2 references changed, 1 item added" from the counts, leaving out what is zero. */
export function describeItemCounts(subject: SubjectChange): string {
  const parts = [
    subject.counts.referenceChanged > 0 ? plural(subject.counts.referenceChanged, 'reference changed', 'references changed') : undefined,
    subject.counts.added > 0 ? plural(subject.counts.added, 'item added', 'items added') : undefined,
    subject.counts.removed > 0 ? plural(subject.counts.removed, 'item removed', 'items removed') : undefined
  ].filter(Boolean);
  return parts.join(', ');
}

export const ITEM_CHANGE_TEXT: Record<ItemChange['change'], string> = {
  added: 'Added',
  removed: 'Removed',
  'reference-changed': 'Reference changed',
  unchanged: 'Unchanged'
};
