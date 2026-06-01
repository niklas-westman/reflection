import type { ReflectionConfig, RunMode } from './config.js';

export type TargetSource = 'reflection-config' | 'adapter';
export type TargetFamily = 'browser-route' | 'route-visual' | 'component-visual' | 'design-command';

export type TargetIR = {
  project: string;
  targets: ReflectionTarget[];
};

export type ReflectionTarget = BrowserRouteTarget | RouteVisualTarget | ComponentVisualTarget | DesignCommandTarget;

type TargetBase = {
  id: string;
  family: TargetFamily;
  source: TargetSource;
  runModes: RunMode[];
  blocking: boolean;
};

export type BrowserRouteTarget = TargetBase & {
  family: 'browser-route';
  route: {
    path: string;
    name?: string | undefined;
    viewports: string[];
    expects: unknown[];
  };
  browser: {
    baseUrl: string;
    maskSelectors: string[];
  };
};

export type RouteVisualTarget = TargetBase & {
  family: 'route-visual';
  route: {
    path: string;
  };
  visual: {
    viewport: string;
    baseline: string;
    baselineRoot?: string | undefined;
    threshold?: unknown;
  };
};

export type ComponentVisualTarget = TargetBase & {
  family: 'component-visual';
  story: {
    storyId: string;
    statePolicy: 'story-controlled' | 'browser-forced-with-stabilization';
    stateNote?: string | undefined;
    browserState?: unknown;
  };
  visual: {
    viewport: string;
    baseline: string;
    baselineRoot?: string | undefined;
    threshold?: unknown;
  };
};

export type DesignCommandTarget = TargetBase & {
  family: 'design-command';
  command: {
    command: string;
    cwd?: string | undefined;
  };
};

export function compileReflectionTargets(config: ReflectionConfig): TargetIR {
  const targets: ReflectionTarget[] = [];
  const browser = config.contracts.browser;
  if (browser && browser.enabled !== false) {
    for (const route of browser.routes) {
      targets.push({
        id: route.id,
        family: 'browser-route',
        source: 'reflection-config',
        runModes: ['smoke', 'full'],
        blocking: browser.blocking ?? true,
        route: {
          path: route.path,
          ...(route.name ? { name: route.name } : {}),
          viewports: route.viewports,
          expects: route.expects
        },
        browser: {
          baseUrl: browser.baseUrl,
          maskSelectors: browser.maskSelectors ?? []
        }
      });
    }

    for (const visualCase of browser.visualSmoke ?? []) {
      targets.push({
        id: visualCase.id,
        family: 'route-visual',
        source: 'reflection-config',
        runModes: ['smoke', 'full'],
        blocking: visualCase.blocking === true || visualCase.strict === true,
        route: {
          path: visualCase.route
        },
        visual: {
          viewport: visualCase.viewport,
          baseline: visualCase.baseline,
          ...(visualCase.baselineRoot ? { baselineRoot: visualCase.baselineRoot } : {}),
          ...(visualCase.threshold !== undefined ? { threshold: visualCase.threshold } : {})
        }
      });
    }
  }

  const component = config.contracts.component;
  if (component && component.enabled !== false) {
    for (const componentCase of component.cases) {
      targets.push({
        id: componentCase.id,
        family: 'component-visual',
        source: 'reflection-config',
        runModes: ['visual', 'full'],
        blocking: componentCase.blocking === true || componentCase.strict === true,
        story: {
          storyId: componentCase.storyId,
          statePolicy: componentCase.browserState ? 'browser-forced-with-stabilization' : 'story-controlled',
          ...(componentCase.stateNote ? { stateNote: componentCase.stateNote } : {}),
          ...(componentCase.browserState ? { browserState: componentCase.browserState } : {})
        },
        visual: {
          viewport: componentCase.viewport ?? 'component',
          baseline: componentCase.baseline,
          ...(componentCase.baselineRoot ? { baselineRoot: componentCase.baselineRoot } : {}),
          ...(componentCase.threshold !== undefined ? { threshold: componentCase.threshold } : {})
        }
      });
    }
  }

  const design = config.contracts.design;
  if (design && design.enabled !== false) {
    for (const designCommand of design.commands) {
      targets.push({
        id: designCommand.id,
        family: 'design-command',
        source: 'reflection-config',
        runModes: ['design', 'full'],
        blocking: designCommand.blocking ?? true,
        command: {
          command: designCommand.command,
          ...(designCommand.cwd ? { cwd: designCommand.cwd } : {})
        }
      });
    }
  }

  return { project: config.project, targets };
}
