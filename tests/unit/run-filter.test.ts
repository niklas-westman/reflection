import { describe, expect, it } from 'vitest';
import { validateReflectionConfig } from '../../src/core/config.js';
import { applyRunFilter, countRunnableTargets, hasRunFilter } from '../../src/core/run-filter.js';

const config = validateReflectionConfig({
  project: 'filter-fixture',
  contracts: {
    browser: {
      baseUrl: 'http://127.0.0.1:5173',
      routes: [
        { id: 'login', path: '/login', viewports: ['desktop', 'mobile'] },
        {
          id: 'my-work',
          path: '/my-work',
          states: [{ id: 'start' }, { id: 'overview' }, { id: 'chat' }]
        }
      ],
      visualSmoke: [
        { id: 'login-desktop', route: 'login', viewport: 'desktop', baseline: 'login.png' },
        { id: 'my-work-start', route: 'my-work', viewport: 'desktop', state: 'start', baseline: 'start.png' },
        { id: 'my-work-chat', route: 'my-work', viewport: 'desktop', state: 'chat', baseline: 'chat.png' }
      ]
    },
    design: { commands: [{ id: 'tokens', command: 'pnpm check:tokens' }] },
    component: { portal: { entry: 'e.tsx', readyUrl: 'http://127.0.0.1:6106' }, cases: [{ id: 'button', path: '/button', viewportSize: { width: 100, height: 100 }, baseline: 'b.png' }] }
  }
});

const none = { routes: [], states: [], cases: [] };

describe('applyRunFilter', () => {
  it('leaves the config untouched without filters', () => {
    expect(hasRunFilter(none)).toBe(false);
    expect(applyRunFilter(config, none).config).toBe(config);
  });

  it('narrows to a route and drops design commands and component cases', () => {
    const { config: filtered } = applyRunFilter(config, { ...none, routes: ['my-work'] });

    expect(filtered.contracts.browser?.routes.map((route) => route.id)).toEqual(['my-work']);
    expect(filtered.contracts.browser?.visualSmoke.map((visualCase) => visualCase.id)).toEqual(['my-work-start', 'my-work-chat']);
    expect(filtered.contracts.design?.commands).toEqual([]);
    expect(filtered.contracts.component?.cases).toEqual([]);
  });

  it('narrows to the requested states of a route', () => {
    const { config: filtered } = applyRunFilter(config, { routes: ['my-work'], states: ['overview', 'chat'], cases: [] });

    expect(filtered.contracts.browser?.routes[0]?.states?.map((state) => state.id)).toEqual(['overview', 'chat']);
    expect(filtered.contracts.browser?.visualSmoke.map((visualCase) => visualCase.id)).toEqual(['my-work-chat']);
  });

  it('runs only the route and state that a selected case needs', () => {
    const { config: filtered } = applyRunFilter(config, { ...none, cases: ['my-work-chat'] });

    expect(filtered.contracts.browser?.routes.map((route) => [route.id, route.states?.map((state) => state.id)])).toEqual([['my-work', ['chat']]]);
    expect(filtered.contracts.browser?.visualSmoke.map((visualCase) => visualCase.id)).toEqual(['my-work-chat']);
    expect(filtered.contracts.component?.cases).toEqual([]);
  });

  it('selects component cases by case id', () => {
    const { config: filtered } = applyRunFilter(config, { ...none, cases: ['button'] });

    expect(filtered.contracts.browser?.routes).toEqual([]);
    expect(filtered.contracts.component?.cases.map((componentCase) => componentCase.id)).toEqual(['button']);
  });

  it('reports ids that exist nowhere in the config', () => {
    const { unmatched } = applyRunFilter(config, { routes: ['nope'], states: ['start', 'ghost'], cases: ['missing'] });

    expect(unmatched).toEqual({ routes: ['nope'], states: ['ghost'], cases: ['missing'] });
  });
});

describe('countRunnableTargets', () => {
  it('counts per mode so a filter that only matches other modes runs nothing', () => {
    const { config: filtered } = applyRunFilter(config, { ...none, cases: ['button'] });

    expect(countRunnableTargets(filtered, 'smoke')).toBe(0);
    expect(countRunnableTargets(filtered, 'visual')).toBe(1);
  });

  it('counts routes x viewports x states plus visual cases', () => {
    expect(countRunnableTargets(config, 'smoke')).toBe(2 + 3 + 3);
  });
});
