import { describe, expect, it } from 'vitest';
import { compileReflectionTargets } from '../../src/core/target-ir.js';
import { validateReflectionConfig } from '../../src/core/config.js';

describe('compileReflectionTargets', () => {
  it('compiles browser routes, route visuals, component visuals, and design commands into target IR', () => {
    const config = validateReflectionConfig({
      project: 'basic-react',
      contracts: {
        browser: {
          enabled: true,
          blocking: false,
          baseUrl: 'http://127.0.0.1:5173',
          maskSelectors: ['[data-private]'],
          routes: [
            {
              id: 'login',
              name: 'Login',
              path: '/login',
              viewports: ['desktop', 'mobile'],
              expects: [{ role: 'heading', name: 'Welcome' }]
            }
          ],
          visualSmoke: [
            {
              id: 'login-mobile',
              route: '/login',
              viewport: 'mobile',
              baseline: 'browser/login/mobile.png',
              threshold: { maxDiffPixels: 0 },
              strict: true
            }
          ]
        },
        component: {
          storybook: {
            command: 'pnpm storybook',
            readyUrl: 'http://127.0.0.1:6006'
          },
          cases: [
            {
              id: 'button-primary',
              storyId: 'button--primary',
              viewport: 'button-default',
              viewportSize: { width: 320, height: 180 },
              framing: { background: '#ffffff', padding: 12 },
              baseline: 'components/button-primary.png',
              threshold: { maxDiffPixelRatio: 0 },
              stateNote: 'Use story args for state.'
            }
          ]
        },
        design: {
          enabled: true,
          commands: [{ id: 'tokens', command: 'pnpm tokens:check', blocking: true }]
        }
      }
    });

    const ir = compileReflectionTargets(config);

    expect(ir.project).toBe('basic-react');
    expect(ir.targets.map((target) => `${target.family}:${target.id}`)).toEqual([
      'browser-route:login',
      'route-visual:login-mobile',
      'component-visual:button-primary',
      'design-command:tokens'
    ]);
    expect(ir.targets[0]).toMatchObject({
      family: 'browser-route',
      source: 'reflection-config',
      id: 'login',
      runModes: ['smoke', 'full'],
      blocking: false,
      route: { path: '/login', viewports: ['desktop', 'mobile'] },
      browser: { baseUrl: 'http://127.0.0.1:5173', maskSelectors: ['[data-private]'] }
    });
    expect(ir.targets[1]).toMatchObject({
      family: 'route-visual',
      id: 'login-mobile',
      runModes: ['smoke', 'full'],
      blocking: true,
      visual: { baseline: 'browser/login/mobile.png', viewport: 'mobile', threshold: { maxDiffPixels: 0 } }
    });
    expect(ir.targets[2]).toMatchObject({
      family: 'component-visual',
      id: 'button-primary',
      runModes: ['visual', 'full'],
      story: { storyId: 'button--primary', statePolicy: 'story-controlled', stateNote: 'Use story args for state.' },
      visual: {
        baseline: 'components/button-primary.png',
        viewport: 'button-default',
        viewportSize: { width: 320, height: 180 },
        framing: { rootSelector: '#storybook-root', background: '#ffffff', align: 'center', padding: 12 },
        threshold: { maxDiffPixelRatio: 0 }
      }
    });
    expect(ir.targets[3]).toMatchObject({
      family: 'design-command',
      id: 'tokens',
      runModes: ['design', 'full'],
      blocking: true,
      command: { command: 'pnpm tokens:check' }
    });
  });

  it('keeps the target IR generic so future adapters compile to the same shape without user-facing external names', () => {
    const config = validateReflectionConfig({
      project: 'neutral-product',
      contracts: {
        browser: {
          baseUrl: 'http://127.0.0.1:5173',
          routes: [{ id: 'home', path: '/', viewports: ['desktop'], expects: [] }]
        }
      }
    });

    const irText = JSON.stringify(compileReflectionTargets(config)).toLowerCase();

    expect(irText).toContain('reflection-config');
    expect(irText).not.toContain('greenhouse');
  });
});
