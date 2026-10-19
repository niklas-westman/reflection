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

export const paths = {
  bundles: (): string => '#/',
  bundle: (bundleId: string): string => `#/bundles/${encode(bundleId)}`,
  changes: (bundleId: string): string => `#/bundles/${encode(bundleId)}/changes`,
  subject: (bundleId: string, kind: SubjectKind, subjectId: string): string => `#/bundles/${encode(bundleId)}/${sectionOf(kind)}/${encode(subjectId)}`,
  comparison: (bundleId: string, kind: SubjectKind, subjectId: string, comparisonId: string): string =>
    `${paths.subject(bundleId, kind, subjectId)}/comparisons/${encode(comparisonId)}`
};
