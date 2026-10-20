import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHttpCatalog } from '../src/data/bundle-catalog';

function serve(routes: Record<string, unknown>): string[] {
  const asked: string[] = [];
  vi.stubGlobal('fetch', async (url: string) => {
    asked.push(url);
    return url in routes ? new Response(JSON.stringify(routes[url]), { status: 200 }) : new Response('not found', { status: 404 });
  });
  return asked;
}

afterEach(() => vi.unstubAllGlobals());

const entry = { id: 'b-1', project: 'marwes', release: 'button-1', build: 1, state: 'candidate', builtAt: '2026-10-21T09:00:00Z', bundleHash: 'a'.repeat(64) };

describe('the HTTP catalog', () => {
  it('reads index.json under any base and gives the latest pointer as the host wrote it', async () => {
    serve({ 'https://dev.example.com/reflection/index.json': { schemaVersion: 1, generatedAt: '2026-10-21T09:00:00Z', bundles: [entry], latest: { marwes: 'b-1' } } });
    const catalog = createHttpCatalog('https://dev.example.com/reflection/');

    expect((await catalog.list()).map((bundle) => bundle.id)).toEqual(['b-1']);
    expect(await catalog.latest()).toEqual({ marwes: 'b-1' });
    expect(catalog.decisions).toBeUndefined();
  });

  it('refuses an index.json of the wrong shape with a message that names the problem', async () => {
    serve({ 'https://dev.example.com/reflection/index.json': { bundles: [{ id: 'b-1' }] } });
    await expect(createHttpCatalog('https://dev.example.com/reflection').list()).rejects.toThrow(/The bundle list is not valid: schemaVersion/);
  });

  it('asks the decision API for a release only when the host configured one', async () => {
    const asked = serve({ 'https://dev.example.com/reflection/api/decisions?release=button-1': { decisions: [] } });
    const catalog = createHttpCatalog('https://dev.example.com/reflection', { decisionsUrl: 'https://dev.example.com/reflection/api/' });

    expect(await catalog.decisions?.('button-1')).toEqual([]);
    expect(asked).toEqual(['https://dev.example.com/reflection/api/decisions?release=button-1']);
  });
});
