const DATE_FORMAT = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

/** A calendar date in UTC, so the same bundle reads the same everywhere. */
export function formatDate(iso: string): string {
  return DATE_FORMAT.format(new Date(iso));
}

export function joinDimensions(dimensions: Record<string, string>): string {
  return Object.values(dimensions).join(' · ');
}
