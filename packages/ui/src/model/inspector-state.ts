export type InspectorMode = 'side-by-side' | 'difference-large' | 'overlay' | 'wipe' | 'diff';
export type Zoom = 'fit' | 100 | 200 | 400;

export const INSPECTOR_MODES: ReadonlyArray<{ mode: InspectorMode; label: string }> = [
  { mode: 'side-by-side', label: 'Side by side' },
  { mode: 'overlay', label: 'Overlay' },
  { mode: 'wipe', label: 'Wipe' },
  { mode: 'diff', label: 'Diff' },
  // Last, so the keys 1 to 4 keep their modes.
  { mode: 'difference-large', label: 'Difference large' }
];

export const ZOOMS: readonly Zoom[] = ['fit', 100, 200, 400];

export interface InspectorView {
  mode: InspectorMode;
  zoom: Zoom;
  checkerboard: boolean;
}

export const DEFAULT_INSPECTOR_VIEW: InspectorView = { mode: 'side-by-side', zoom: 'fit', checkerboard: false };

/** The inspector state a URL describes. Anything unrecognised falls back to the default. */
export function parseInspectorSearch(raw: Record<string, unknown>): InspectorView {
  const mode = INSPECTOR_MODES.find((entry) => entry.mode === raw.mode)?.mode ?? 'side-by-side';
  const zoomValue = raw.zoom === 'fit' ? 'fit' : Number(raw.zoom);
  const zoom = ZOOMS.find((entry) => entry === zoomValue) ?? 'fit';
  return { mode, zoom, checkerboard: raw.checker === true || raw.checker === 'true' || raw.checker === 1 || raw.checker === '1' };
}

/** The URL part for an inspector state, leaving out the defaults. */
export function toInspectorSearch(view: InspectorView): Record<string, unknown> {
  const search: Record<string, unknown> = {};
  if (view.mode !== DEFAULT_INSPECTOR_VIEW.mode) search.mode = view.mode;
  if (view.zoom !== DEFAULT_INSPECTOR_VIEW.zoom) search.zoom = view.zoom;
  if (view.checkerboard) search.checker = 1;
  return search;
}
