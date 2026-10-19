// Links are plain hash URLs, so they work in a static host and can be pasted. Ids may contain "/", so each
// segment is encoded; the router decodes them again.
const encode = encodeURIComponent;

export type SubjectKind = 'component' | 'page';
export type Section = 'components' | 'pages';

export const SECTION_TITLES: Record<Section, string> = { components: 'Components', pages: 'Pages' };

export function sectionOf(kind: SubjectKind): Section {
  return kind === 'component' ? 'components' : 'pages';
}

export function isSection(value: string | undefined): value is Section {
  return value === 'components' || value === 'pages';
}

/** A query string in the form the router reads back: strings as they are, everything else as JSON. */
export function searchString(search: Record<string, unknown>): string {
  const parts = Object.entries(search)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(typeof value === 'string' ? value : JSON.stringify(value))}`);
  return parts.length > 0 ? `?${parts.join('&')}` : '';
}

export const paths = {
  bundles: (): string => '#/',
  bundle: (bundleId: string): string => `#/bundles/${encode(bundleId)}`,
  changes: (bundleId: string): string => `#/bundles/${encode(bundleId)}/changes`,
  // `outcome` opens the subject already filtered to one outcome group (failed, not-proven, passed, missing).
  subject: (bundleId: string, kind: SubjectKind, subjectId: string, options: { outcome?: string } = {}): string =>
    `#/bundles/${encode(bundleId)}/${sectionOf(kind)}/${encode(subjectId)}${options.outcome ? `?view=items&outcome=${options.outcome}` : ''}`,
  // `search` carries the filters of the page the reader came from, so previous and next follow what it showed.
  comparison: (bundleId: string, kind: SubjectKind, subjectId: string, comparisonId: string, search: Record<string, unknown> = {}): string =>
    `${paths.subject(bundleId, kind, subjectId).split('?')[0]}/comparisons/${encode(comparisonId)}${searchString(search)}`
};
