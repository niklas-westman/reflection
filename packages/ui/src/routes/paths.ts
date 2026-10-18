// Links are plain hash URLs, so they work in a static host and can be pasted. Ids may contain "/", so each
// segment is encoded; the router decodes them again.
const encode = encodeURIComponent;

export const paths = {
  bundles: (): string => '#/',
  bundle: (bundleId: string): string => `#/bundles/${encode(bundleId)}`,
  subject: (bundleId: string, subjectId: string): string => `#/bundles/${encode(bundleId)}/subjects/${encode(subjectId)}`,
  comparison: (bundleId: string, subjectId: string, comparisonId: string): string =>
    `#/bundles/${encode(bundleId)}/subjects/${encode(subjectId)}/comparisons/${encode(comparisonId)}`
};
