// `reflection-config.json`, served next to the viewer by a host. Both URLs are relative to the viewer's own
// address unless absolute. Without the file the viewer reads bundles from `bundles/` (the local development
// server) and records no decisions.
export interface ViewerConfig {
  bundlesUrl: string;
  decisionsUrl: string | undefined;
}

export const VIEWER_CONFIG_FILE = 'reflection-config.json';

const DEFAULT_BUNDLES_URL = 'bundles';

/** The config as absolute URLs, resolved against the address the viewer was loaded from. Throws on a wrong shape. */
export function resolveViewerConfig(raw: unknown, base: string): ViewerConfig {
  const config = (raw ?? {}) as Record<string, unknown>;
  if (typeof config !== 'object' || Array.isArray(config)) throw new Error(`${VIEWER_CONFIG_FILE} must be a JSON object`);
  for (const key of ['bundlesUrl', 'decisionsUrl']) {
    if (config[key] !== undefined && (typeof config[key] !== 'string' || config[key] === '')) throw new Error(`${VIEWER_CONFIG_FILE}: ${key} must be a non-empty string`);
  }
  const bundlesUrl = (config.bundlesUrl as string | undefined) ?? DEFAULT_BUNDLES_URL;
  const decisionsUrl = config.decisionsUrl as string | undefined;
  return { bundlesUrl: new URL(bundlesUrl, base).toString(), decisionsUrl: decisionsUrl ? new URL(decisionsUrl, base).toString() : undefined };
}

/** Reads the config the host serves; a missing file means the defaults, a broken one is an error, never ignored. */
export async function loadViewerConfig(base: string): Promise<ViewerConfig> {
  const response = await fetch(new URL(VIEWER_CONFIG_FILE, base));
  // A host that answers every unknown path with the viewer's page (a single-page fallback) has no config either.
  if (response.status === 404 || response.headers.get('content-type')?.includes('text/html')) return resolveViewerConfig({}, base);
  if (!response.ok) throw new Error(`${VIEWER_CONFIG_FILE} could not be loaded (HTTP ${response.status}).`);
  return resolveViewerConfig(await response.json().catch(() => 'not json'), base);
}
