// Fixed month names: the platform's own short names differ between versions ("Sep" and "Sept"), and the same
// bundle must read the same everywhere.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

/** A calendar date in UTC, such as "14 Oct 2026". */
export function formatDate(iso: string): string {
  const date = new Date(iso);
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()] ?? ''} ${date.getUTCFullYear()}`;
}

export function joinDimensions(dimensions: Record<string, string>): string {
  return Object.values(dimensions).join(' · ');
}
