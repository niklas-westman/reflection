import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadReflectionConfig, validateReflectionConfig } from '../../src/core/config.js';
import { defineReflection } from '../../src/core/define-reflection.js';

async function makeTempDir() {
  const dir = join(tmpdir(), `reflection-config-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  await mkdir(dir, { recursive: true });
  return dir;
}

describe('defineReflection', () => {
  it('returns a standalone reflection config without renaming the product', () => {
    const config = defineReflection({
      project: 'basic-react',
      run: { defaultMode: 'smoke', ciMode: 'smoke' },
      contracts: {
        browser: {
          enabled: true,
          blocking: true,
          baseUrl: 'http://127.0.0.1:5173',
          routes: []
        }
      }
    });

    expect(config.project).toBe('basic-react');
    expect(JSON.stringify(config).toLowerCase()).not.toContain('greenhouse');
  });
});

describe('validateReflectionConfig', () => {
  it('normalizes a minimal valid browser config', () => {
    const config = validateReflectionConfig({
      project: 'basic-react',
      contracts: {
        browser: {
          enabled: true,
          baseUrl: 'http://127.0.0.1:5173',
          routes: []
        }
      }
    });

    expect(config.run.defaultMode).toBe('smoke');
    expect(config.run.ciMode).toBe('smoke');
    expect(config.contracts.browser.blocking).toBe(true);
  });

  it('rejects invalid run modes', () => {
    expect(() =>
      validateReflectionConfig({
        project: 'basic-react',
        run: { defaultMode: 'everything' },
        contracts: {
          browser: {
            enabled: true,
            baseUrl: 'http://127.0.0.1:5173',
            routes: []
          }
        }
      })
    ).toThrow(/Invalid Reflection config/);
  });

  it('accepts screenshot privacy mask selectors for browser routes', () => {
    const config = validateReflectionConfig({
      project: 'basic-react',
      contracts: {
        browser: {
          enabled: true,
          baseUrl: 'http://127.0.0.1:5173',
          maskSelectors: ['[data-private]', '.secret'],
          routes: []
        }
      }
    });

    expect(config.contracts.browser.maskSelectors).toEqual(['[data-private]', '.secret']);
  });

  it('accepts browser-level and route-level storage setup without exposing values through config normalization', () => {
    const config = validateReflectionConfig({
      project: 'basic-react',
      contracts: {
        browser: {
          enabled: true,
          baseUrl: 'http://127.0.0.1:5173',
          setup: {
            localStorage: {
              'reflection:test-user': 'fixture-user'
            }
          },
          routes: [
            {
              id: 'auth',
              path: '/auth',
              setup: {
                sessionStorage: {
                  'reflection:test-session': 'fixture-session'
                }
              }
            }
          ]
        }
      }
    });

    expect(config.contracts.browser.setup?.localStorage).toEqual({ 'reflection:test-user': 'fixture-user' });
    expect(config.contracts.browser.routes[0]?.setup?.sessionStorage).toEqual({ 'reflection:test-session': 'fixture-session' });
  });

  it('rejects empty browser setup storage keys', () => {
    expect(() =>
      validateReflectionConfig({
        project: 'basic-react',
        contracts: {
          browser: {
            enabled: true,
            baseUrl: 'http://127.0.0.1:5173',
            routes: [
              {
                id: 'auth',
                path: '/auth',
                setup: {
                  localStorage: {
                    '': 'fixture-user'
                  }
                }
              }
            ]
          }
        }
      })
    ).toThrow(/Invalid Reflection config/);
  });

  it('rejects impossible visual diff ratios', () => {
    expect(() =>
      validateReflectionConfig({
        project: 'basic-react',
        contracts: {
          browser: {
            enabled: true,
            baseUrl: 'http://127.0.0.1:5173',
            routes: [],
            visualSmoke: [
              {
                id: 'login-mobile',
                route: 'login',
                viewport: 'mobile',
                baseline: 'browser/login/mobile.png',
                threshold: { maxDiffPixelRatio: 1.5 }
              }
            ]
          }
        }
      })
    ).toThrow(/Invalid Reflection config/);
  });

  it('accepts a component visual state note for story-controlled states', () => {
    const config = validateReflectionConfig({
      project: 'basic-react',
      contracts: {
        component: {
          storybook: {
            command: 'pnpm storybook',
            readyUrl: 'http://127.0.0.1:6006'
          },
          cases: [
            {
              id: 'button-primary-hover',
              storyId: 'button--primary-hover',
              baseline: 'components/button-primary-hover.png',
              stateNote: 'Hover state is represented by story args/decorators, not browser-forced hover.'
            }
          ]
        }
      }
    });

    expect(config.contracts.component?.cases[0]?.stateNote).toBe(
      'Hover state is represented by story args/decorators, not browser-forced hover.'
    );
  });

  it('accepts a custom component viewport size for fixed Figma baselines', () => {
    const config = validateReflectionConfig({
      project: 'basic-react',
      contracts: {
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
              baseline: 'components/button-primary.png'
            }
          ]
        }
      }
    });

    expect(config.contracts.component?.cases[0]).toMatchObject({
      viewport: 'button-default',
      viewportSize: { width: 320, height: 180 }
    });
  });

  it('accepts portal component visual cases with fixed viewport size and framing', () => {
    const config = validateReflectionConfig({
      project: 'basic-react',
      contracts: {
        component: {
          portal: {
            entry: './tests/reflection/react-portal.tsx',
            readyUrl: 'http://127.0.0.1:6106'
          },
          cases: [
            {
              id: 'button-primary',
              path: '/reflection/button/primary/light',
              viewport: 'button-default',
              viewportSize: { width: 390, height: 220 },
              framing: {
                background: '#ffffff',
                padding: 0
              },
              probes: {
                parts: {
                  root: {
                    selector: '[data-reflection-part="root"]',
                    styles: ['backgroundColor', 'borderColor'],
                    cssVariables: ['--mw-color-primary'],
                    text: true
                  }
                }
              },
              baseline: 'components/button-primary.png'
            }
          ]
        }
      }
    });

    expect(config.contracts.component?.portal).toMatchObject({
      entry: './tests/reflection/react-portal.tsx',
      readyUrl: 'http://127.0.0.1:6106',
      reuseExisting: true,
      timeoutMs: 60_000
    });
    expect(config.contracts.component?.cases[0]).toMatchObject({
      path: '/reflection/button/primary/light',
      viewport: 'button-default',
      viewportSize: { width: 390, height: 220 },
      framing: {
        rootSelector: '#reflection-root',
        background: '#ffffff',
        align: 'center',
        padding: 0
      },
      probes: {
        parts: {
          root: {
            selector: '[data-reflection-part="root"]',
            bounds: true,
            styles: ['backgroundColor', 'borderColor'],
            cssVariables: ['--mw-color-primary'],
            text: true
          }
        }
      }
    });
  });

  it('rejects portal component visual cases without viewportSize', () => {
    expect(() =>
      validateReflectionConfig({
        project: 'basic-react',
        contracts: {
          component: {
            portal: {
              entry: './tests/reflection/react-portal.tsx',
              readyUrl: 'http://127.0.0.1:6106'
            },
            cases: [
              {
                id: 'button-primary',
                path: '/reflection/button/primary/light',
                baseline: 'components/button-primary.png'
              }
            ]
          }
        }
      })
    ).toThrow(/portal component visual cases require viewportSize/);
  });

  it('rejects component visual cases that define both storyId and path', () => {
    expect(() =>
      validateReflectionConfig({
        project: 'basic-react',
        contracts: {
          component: {
            storybook: {
              command: 'pnpm storybook',
              readyUrl: 'http://127.0.0.1:6006'
            },
            portal: {
              entry: './tests/reflection/react-portal.tsx',
              readyUrl: 'http://127.0.0.1:6106'
            },
            cases: [
              {
                id: 'button-primary',
                storyId: 'button--primary',
                path: '/reflection/button/primary/light',
                viewportSize: { width: 390, height: 220 },
                baseline: 'components/button-primary.png'
              }
            ]
          }
        }
      })
    ).toThrow(/must define either storyId or path, not both/);
  });

  it('rejects component visual cases without the required runtime config', () => {
    expect(() =>
      validateReflectionConfig({
        project: 'basic-react',
        contracts: {
          component: {
            cases: [
              {
                id: 'button-primary',
                storyId: 'button--primary',
                baseline: 'components/button-primary.png'
              }
            ]
          }
        }
      })
    ).toThrow(/storyId component visual cases require component.storybook/);

    expect(() =>
      validateReflectionConfig({
        project: 'basic-react',
        contracts: {
          component: {
            cases: [
              {
                id: 'button-primary',
                path: '/reflection/button/primary/light',
                viewportSize: { width: 390, height: 220 },
                baseline: 'components/button-primary.png'
              }
            ]
          }
        }
      })
    ).toThrow(/path component visual cases require component.portal/);
  });

  it('accepts component framing for fixed Figma baselines', () => {
    const config = validateReflectionConfig({
      project: 'basic-react',
      contracts: {
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
              viewportSize: { width: 390, height: 220 },
              framing: {
                background: '#ffffff',
                padding: 16
              },
              baseline: 'components/button-primary.png'
            }
          ]
        }
      }
    });

    expect(config.contracts.component?.cases[0]?.framing).toEqual({
      rootSelector: '#storybook-root',
      background: '#ffffff',
      align: 'center',
      padding: 16
    });
  });

  it('rejects invalid component framing options', () => {
    expect(() =>
      validateReflectionConfig({
        project: 'basic-react',
        contracts: {
          component: {
            storybook: {
              command: 'pnpm storybook',
              readyUrl: 'http://127.0.0.1:6006'
            },
            cases: [
              {
                id: 'button-primary',
                storyId: 'button--primary',
                framing: {
                  rootSelector: '',
                  align: 'middle',
                  padding: -1
                },
                baseline: 'components/button-primary.png'
              }
            ]
          }
        }
      })
    ).toThrow(/Invalid Reflection config/);
  });

  it('rejects invalid custom component viewport sizes', () => {
    expect(() =>
      validateReflectionConfig({
        project: 'basic-react',
        contracts: {
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
                viewportSize: { width: 320.5, height: 0 },
                baseline: 'components/button-primary.png'
              }
            ]
          }
        }
      })
    ).toThrow(/Invalid Reflection config/);
  });

  it('rejects browser-forced component pseudo states without animation stabilization', () => {
    expect(() =>
      validateReflectionConfig({
        project: 'basic-react',
        contracts: {
          component: {
            storybook: {
              command: 'pnpm storybook',
              readyUrl: 'http://127.0.0.1:6006'
            },
            cases: [
              {
                id: 'button-primary-hover',
                storyId: 'button--primary',
                baseline: 'components/button-primary-hover.png',
                browserState: { kind: 'hover', selector: 'button' }
              }
            ]
          }
        }
      })
    ).toThrow(/animationStabilization/);
  });

  it('rejects browser-forced component pseudo states with ineffective animation stabilization', () => {
    expect(() =>
      validateReflectionConfig({
        project: 'basic-react',
        contracts: {
          component: {
            storybook: {
              command: 'pnpm storybook',
              readyUrl: 'http://127.0.0.1:6006'
            },
            cases: [
              {
                id: 'button-primary-hover',
                storyId: 'button--primary',
                baseline: 'components/button-primary-hover.png',
                browserState: {
                  kind: 'hover',
                  selector: 'button',
                  animationStabilization: { disableAnimations: false, waitMs: 0 }
                }
              }
            ]
          }
        }
      })
    ).toThrow(/effective animation stabilization/);
  });
});

describe('loadReflectionConfig', () => {
  it('loads a JavaScript config module from disk', async () => {
    const dir = await makeTempDir();
    const configPath = join(dir, 'reflection.config.mjs');
    await writeFile(
      configPath,
      `export default { project: 'from-disk', contracts: { browser: { enabled: true, baseUrl: 'http://127.0.0.1:5173', routes: [] } } };`,
      'utf8'
    );

    const config = await loadReflectionConfig(configPath);

    expect(config.project).toBe('from-disk');
    expect(config.run.defaultMode).toBe('smoke');
  });

  it('loads a TypeScript config module from disk', async () => {
    const dir = await makeTempDir();
    const configPath = join(dir, 'reflection.config.ts');
    await writeFile(
      configPath,
      `
        import { defineReflection } from '${process.cwd()}/src/core/define-reflection.ts';

        const project: string = 'from-typescript';

        export default defineReflection({
          project,
          contracts: {
            browser: {
              enabled: true,
              baseUrl: 'http://127.0.0.1:5173',
              routes: []
            }
          }
        });
      `,
      'utf8'
    );

    const config = await loadReflectionConfig(configPath);

    expect(config.project).toBe('from-typescript');
    expect(config.run.defaultMode).toBe('smoke');
  });

  it('loads a TypeScript config from a relative path', async () => {
    const config = await loadReflectionConfig('examples/basic-react/reflection.config.ts');

    expect(config.project).toBe('basic-react');
    expect(config.contracts.browser?.routes.map((route) => route.id)).toEqual(['login', 'overflow', 'console-error']);
  });

  it('fails clearly when the config file is missing', async () => {
    await expect(loadReflectionConfig('/tmp/reflection-missing.config.mjs')).rejects.toThrow(
      /Reflection config not found/
    );
  });
});
