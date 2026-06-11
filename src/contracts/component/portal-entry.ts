import type { ViewportSize } from '../../integrations/playwright/context-factory.js';

export type ReflectionPortalFraming = {
  background?: string | undefined;
  align: 'center' | 'start';
  padding: number;
};

export type ReflectionPortalMountInput = {
  id: string;
  path: string;
  root: HTMLElement;
  viewport: string;
  viewportSize: ViewportSize;
  framing: ReflectionPortalFraming;
};

export type ReflectionPortalCleanup = void | (() => void);

export type ReflectionPortalMountResult = ReflectionPortalCleanup | Promise<ReflectionPortalCleanup>;

export type ReflectionPortalMount = (input: ReflectionPortalMountInput) => ReflectionPortalMountResult;
