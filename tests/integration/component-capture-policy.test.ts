import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ComponentVisualCase } from '../../src/contracts/component/component-visual-contract.js';
import {
  captureCase,
  captureReference,
  makeBaselineRoot,
  noMotionStyle,
  runCase,
  startCaptureFixtureServer,
  type CaptureFixtureServer
} from '../helpers/capture-policy-fixture.js';

let server: CaptureFixtureServer;
let baselineRoot: string;

const pressableUrl = () => `${server.baseUrl}/iframe.html?id=pressable`;
const spinnerUrl = () => `${server.baseUrl}/iframe.html?id=spinner`;
const pressed: ComponentVisualCase['browserState'] = { kind: 'pressed', selector: '.btn' };

async function waitForEvents(count: number): Promise<void> {
  for (let attempt = 0; attempt < 40 && server.events.length < count; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  await new Promise((resolve) => setTimeout(resolve, 100));
}

function pixelHash(png: Buffer): string {
  return createHash('sha256').update(PNG.sync.read(png).data).digest('hex');
}

async function actualPixels(run: Awaited<ReturnType<typeof runCase>>, id: string): Promise<string> {
  return pixelHash(await readFile(run.resolveRunPath(`visual/${id}/actual.png`)));
}

beforeAll(async () => {
  server = await startCaptureFixtureServer();
  baselineRoot = await makeBaselineRoot();
  // Independent specifications, captured with plain Playwright, never with Reflection.
  await captureReference(pressableUrl(), join(baselineRoot, 'pressable.png'), async (page) => {
    await page.mouse.move(80, 40);
    await page.mouse.down();
    await page.waitForTimeout(700);
  });
  await captureReference(`${pressableUrl()}`, join(baselineRoot, 'pressable-default.png'));
  await captureReference(pressableUrl(), join(baselineRoot, 'pressable-hover.png'), async (page) => {
    await page.mouse.move(80, 40);
    await page.waitForTimeout(700);
  });
  await captureReference(pressableUrl(), join(baselineRoot, 'pressable-focus.png'), async (page) => {
    await page.locator('.btn').focus();
    await page.waitForTimeout(700);
  });
  await captureReference(spinnerUrl(), join(baselineRoot, 'spinner-phase-zero.png'), async (page) => {
    await page.addStyleTag({ content: noMotionStyle });
  });
});

afterAll(async () => {
  await server.close();
});

beforeEach(() => {
  server.reset();
});

describe('genuine held pointer-down (Pressed) capture', () => {
  it('captures the :active state with a real held press and matches an independent held-down reference', async () => {
    const run = await runCase({ baseUrl: server.baseUrl, story: 'pressable', baselineRoot, caseOverrides: { browserState: pressed, stabilization: { animations: 'none' } } });

    expect(run.check.status).toBe('pass');
    expect(run.check.metadata.diffPixels).toBe(0);
    expect(run.check.metadata.captureOutcome).toMatchObject({
      interaction: {
        kind: 'pressed',
        selector: '.btn',
        established: true,
        position: { x: 80, y: 40 },
        targetBox: { x: 20, y: 20, width: 120, height: 40 },
        after: { matchesActive: true, matchesHover: true, targetOrDescendantFocused: true }
      },
      verification: { verified: true, identical: true }
    });
  }, 40_000);

  it('cannot be substituted by a default screenshot: the same case without Pressed differs from the reference', async () => {
    const run = await runCase({ baseUrl: server.baseUrl, story: 'pressable', baselineRoot });

    expect(run.check.status).toBe('fail');
    expect(run.check.metadata.diffPixels).toBeGreaterThan(1000);
    expect(run.check.metadata.capturePolicy).toBeUndefined();
  }, 40_000);

  it('treats a press landing on a descendant as a press of the target', async () => {
    const run = await runCase({ baseUrl: server.baseUrl, story: 'pressable', baselineRoot, caseOverrides: { browserState: pressed, stabilization: { animations: 'none' } } });
    const interaction = (run.check.metadata.captureOutcome as { interaction: { hit: unknown } }).interaction;

    expect(interaction.hit).toEqual({ tag: 'span', id: null, isTarget: false, isDescendant: true });
  }, 40_000);

  it('lands the pointer at the configured fraction of the target', async () => {
    const run = await runCase({
      baseUrl: server.baseUrl,
      story: 'pressable',
      baselineRoot,
      baseline: 'pressable-default.png',
      caseOverrides: { browserState: { kind: 'pressed', selector: '.btn', position: { x: 0.1, y: 0.2 } }, stabilization: { animations: 'none' } }
    });

    expect(run.check.metadata.captureOutcome).toMatchObject({ interaction: { position: { fractionX: 0.1, fractionY: 0.2, x: 32, y: 28 }, hit: { isTarget: true } } });
  }, 40_000);

  it('holds the button through the screenshot, then releases without clicking the target', async () => {
    await runCase({ baseUrl: server.baseUrl, story: 'pressable', baselineRoot, caseOverrides: { browserState: pressed, stabilization: { animations: 'none' } } });
    await waitForEvents(2);

    expect(server.events.slice(0, 2)).toEqual(['down', 'up']);
    expect(server.events.filter((event) => event === 'down')).toHaveLength(server.events.filter((event) => event === 'up').length);
    expect(server.events).not.toContain('target-click');
  }, 40_000);

  it('releases the pointer and reports it was released', async () => {
    const run = await runCase({ baseUrl: server.baseUrl, story: 'pressable', baselineRoot, caseOverrides: { browserState: pressed, stabilization: { animations: 'none' } } });

    expect(run.check.metadata.captureOutcome).toMatchObject({ release: { released: true, alreadyReleased: false, activeAfterRelease: false } });
  }, 40_000);

  it('detects an implementation that applies no active style', async () => {
    server.pressable = { noActive: true };

    const run = await runCase({ baseUrl: server.baseUrl, story: 'pressable', baselineRoot, caseOverrides: { browserState: pressed, stabilization: { animations: 'none' } } });

    expect(run.check.metadata.captureOutcome).toMatchObject({ interaction: { established: true, after: { matchesActive: true } } });
    expect(run.check.status).toBe('fail');
    expect(run.check.metadata.diffPixels).toBeGreaterThan(1000);
  }, 40_000);

  describe.each([
    ['a disabled target', { disabled: true }, 'target-disabled'],
    ['a hidden target', { hidden: true }, 'target-not-visible'],
    ['two matching targets', { duplicate: true }, 'target-not-unique'],
    ['a target covered by an overlay', { overlay: true }, 'target-obscured'],
    ['a target with pointer-events: none', { pointerNone: true }, 'target-obscured'],
    ['a target outside the viewport', { offscreen: true }, 'target-outside-viewport']
  ])('fails explicitly for %s', (_label, options, code) => {
    it(`reports ${code} and substitutes nothing`, async () => {
      server.pressable = options;

      const run = await runCase({ baseUrl: server.baseUrl, story: 'pressable', baselineRoot, caseOverrides: { browserState: pressed, stabilization: { animations: 'none' } } });
      await new Promise((resolve) => setTimeout(resolve, 150));

      expect(run.check.status).toBe('fail');
      expect(run.check.metadata).toMatchObject({ classification: 'capture-state-not-established', captureError: { code, classification: 'capture-state-not-established' } });
      expect(run.check.diagnostics?.[0]).toMatchObject({ kind: 'component-capture-state-error', severity: 'error' });
      expect(run.check.artifacts.map((artifact) => artifact.role)).toEqual(['expected']);
      expect(run.check.metadata.capturePolicy).toMatchObject({ interaction: { kind: 'pressed' } });
      // The pointer never went down on anything.
      expect(server.events).not.toContain('down');
    }, 40_000);
  });

  it('fails explicitly for a selector that matches nothing', async () => {
    const run = await runCase({ baseUrl: server.baseUrl, story: 'pressable', baselineRoot, caseOverrides: { browserState: { kind: 'pressed', selector: '.nope' }, stabilization: { animations: 'none' } } });

    expect(run.check.metadata).toMatchObject({ captureError: { code: 'target-not-found' } });
  }, 40_000);

  it('releases the pointer when a later step fails, and never clicks the target', async () => {
    // A moving square the CSS policy cannot control: the press is established, then verification fails.
    server.pressable = { raf: true };

    const run = await runCase({ baseUrl: server.baseUrl, story: 'pressable', baselineRoot, caseOverrides: { browserState: pressed, stabilization: { animations: 'none' } } });
    await waitForEvents(2);

    expect(run.check.metadata).toMatchObject({ captureError: { code: 'capture-unstable' } });
    expect(server.events.slice(0, 2)).toEqual(['down', 'up']);
    expect(server.events).not.toContain('target-click');
    expect(run.check.artifacts.map((artifact) => artifact.role)).toEqual(['expected']);
  }, 40_000);

  it('does not leak pressed state into the next case', async () => {
    const standalone = await runCase({ baseUrl: server.baseUrl, story: 'pressable', baselineRoot, baseline: 'pressable-default.png' });
    const combined = await runCase({
      baseUrl: server.baseUrl,
      story: 'pressable',
      baselineRoot,
      caseOverrides: { browserState: pressed, stabilization: { animations: 'none' } },
      extraCases: [captureCase({ story: 'pressable', baselineRoot, baseline: 'pressable-default.png', id: 'after' })]
    });
    const after = combined.checks.find((check) => check.id === 'visual.after');

    expect(combined.check.status).toBe('pass');
    expect(after?.status).toBe('pass');
    expect(after?.metadata.diffPixels).toBe(standalone.check.metadata.diffPixels);
    expect(await actualPixels(combined, 'after')).toBe(await actualPixels(standalone, 'pressable'));
  }, 60_000);

  it.each([
    ['css-none', { animations: 'none' as const }],
    ['web-animations-settle', { animations: 'settle' as const }]
  ])('composes with the %s stabilization policy even though the button has a 400ms transition', async (_name, stabilization) => {
    const run = await runCase({ baseUrl: server.baseUrl, story: 'pressable', baselineRoot, caseOverrides: { browserState: pressed, stabilization } });

    expect(run.check.status).toBe('pass');
    expect(run.check.metadata.captureOutcome).toMatchObject({ interaction: { established: true } });
  }, 40_000);
});

describe('Hover and Focus remain genuine and compose with the policy', () => {
  it('captures a real hover under a case-level policy without legacy animationStabilization', async () => {
    const run = await runCase({
      baseUrl: server.baseUrl,
      story: 'pressable',
      baselineRoot,
      baseline: 'pressable-hover.png',
      caseOverrides: { browserState: { kind: 'hover', selector: '.btn' }, stabilization: { animations: 'settle' } }
    });

    expect(run.check.status).toBe('pass');
    expect(run.check.metadata.captureOutcome).toMatchObject({ interaction: { kind: 'hover', matchesHover: true } });
  }, 40_000);

  it('captures a real focus under a case-level policy', async () => {
    const run = await runCase({
      baseUrl: server.baseUrl,
      story: 'pressable',
      baselineRoot,
      baseline: 'pressable-focus.png',
      caseOverrides: { browserState: { kind: 'focus', selector: '.btn' }, stabilization: { animations: 'none' } }
    });

    expect(run.check.status).toBe('pass');
    expect(run.check.metadata.captureOutcome).toMatchObject({ interaction: { kind: 'focus', focused: true } });
  }, 40_000);

  it('keeps legacy browserState.animationStabilization behaving as before, with no verification step', async () => {
    const run = await runCase({
      baseUrl: server.baseUrl,
      story: 'pressable',
      baselineRoot,
      baseline: 'pressable-hover.png',
      caseOverrides: { browserState: { kind: 'hover', selector: '.btn', animationStabilization: { disableAnimations: true, waitMs: 0 } } }
    });

    expect(run.check.status).toBe('pass');
    expect(run.check.metadata.capturePolicy).toMatchObject({ stabilization: { source: 'browser-state', method: 'css-none', verify: false } });
    expect((run.check.metadata.captureOutcome as { verification: unknown }).verification).toBeNull();
  }, 40_000);

  it('does not leak hover into the next case', async () => {
    const run = await runCase({
      baseUrl: server.baseUrl,
      story: 'pressable',
      baselineRoot,
      baseline: 'pressable-hover.png',
      caseOverrides: { browserState: { kind: 'hover', selector: '.btn' }, stabilization: { animations: 'none' } },
      extraCases: [captureCase({ story: 'pressable', baselineRoot, baseline: 'pressable-default.png', id: 'after' })]
    });

    expect(run.checks.find((check) => check.id === 'visual.after')?.status).toBe('pass');
  }, 60_000);
});

describe('animation stabilization independent of any interaction state', () => {
  const offsets = [0, 130, 290, 410, 650];

  async function captureAcrossPhases(story: 'spinner', overrides: Partial<ComponentVisualCase>, options: Record<string, unknown> = {}): Promise<{ hashes: string[]; statuses: string[]; diffs: unknown[] }> {
    const hashes: string[] = [];
    const statuses: string[] = [];
    const diffs: unknown[] = [];
    for (const offsetMs of offsets) {
      server.spinner = { offsetMs, ...options };
      const run = await runCase({ baseUrl: server.baseUrl, story, baselineRoot, baseline: 'spinner-phase-zero.png', caseOverrides: overrides });
      statuses.push(run.check.status);
      diffs.push(run.check.metadata.diffPixels);
      if (run.check.artifacts.some((artifact) => artifact.role === 'actual')) {
        hashes.push(await actualPixels(run, 'spinner'));
      }
    }
    return { hashes, statuses, diffs };
  }

  it('shows an unconfigured infinite animation really does vary between captures', async () => {
    const { hashes } = await captureAcrossPhases('spinner', {});

    expect(new Set(hashes).size).toBeGreaterThan(1);
  }, 120_000);

  it.each([
    ['css-none', 'none' as const, {}],
    ['web-animations-settle (CSS animation)', 'settle' as const, {}],
    ['web-animations-settle (element.animate)', 'settle' as const, { waapi: true }]
  ])('makes captures phase-independent and equal to an independent static reference with %s', async (_label, animations, options) => {
    const { hashes, statuses, diffs } = await captureAcrossPhases('spinner', { stabilization: { animations } }, options);

    expect(new Set(hashes).size).toBe(1);
    expect(statuses).toEqual(offsets.map(() => 'pass'));
    expect(diffs).toEqual(offsets.map(() => 0));
  }, 180_000);

  it('does not change the real component: animation keeps running outside the capture', async () => {
    server.spinner = {};
    const { chromium } = await import('playwright');
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await (await browser.newContext({ viewport: { width: 160, height: 80 } })).newPage();
      await page.goto(spinnerUrl());
      const read = () => page.evaluate(() => getComputedStyle(document.querySelector('.marker') as Element).transform);
      const first = await read();
      await page.waitForTimeout(250);
      const second = await read();

      expect(second).not.toBe(first);
      expect(await page.evaluate(() => document.getAnimations().filter((animation) => animation.playState === 'running').length)).toBeGreaterThan(0);
    } finally {
      await browser.close();
    }
  }, 40_000);

  it('uses different, documented semantics for finite animations: none shows the base style, settle the end state', async () => {
    server.spinner = { finite: true, offsetMs: 0 };
    const none = await runCase({ baseUrl: server.baseUrl, story: 'spinner', baselineRoot, baseline: 'spinner-phase-zero.png', caseOverrides: { stabilization: { animations: 'none' } } });
    const settle = await runCase({ baseUrl: server.baseUrl, story: 'spinner', baselineRoot, baseline: 'spinner-phase-zero.png', caseOverrides: { stabilization: { animations: 'settle' } } });

    expect(none.check.status).toBe('pass');
    // The badge ends fully opaque after settling, which differs from the base (30% opacity) reference.
    expect(settle.check.status).toBe('fail');
    expect(settle.check.metadata.diffPixels).toBeGreaterThan(0);
    expect(settle.check.metadata.captureOutcome).toMatchObject({ stabilization: { method: 'web-animations-settle', finished: expect.any(Number) } });
    expect((settle.check.metadata.captureOutcome as { stabilization: { finished: number } }).stabilization.finished).toBeGreaterThan(0);
  }, 60_000);

  it('records what the settle method drove: finished and cancelled animations', async () => {
    server.spinner = { finite: true };
    const run = await runCase({ baseUrl: server.baseUrl, story: 'spinner', baselineRoot, baseline: 'spinner-phase-zero.png', caseOverrides: { stabilization: { animations: 'settle' } } });

    expect(run.check.metadata.captureOutcome).toMatchObject({ stabilization: { source: 'case', method: 'web-animations-settle', stillRunning: 0 } });
  }, 40_000);

  it.each([
    ['requestAnimationFrame', { raf: true }],
    ['canvas', { canvas: true }]
  ])('fails explicitly when %s motion cannot be stabilized, instead of recording an arbitrary phase', async (_label, options) => {
    server.spinner = options;

    const run = await runCase({ baseUrl: server.baseUrl, story: 'spinner', baselineRoot, baseline: 'spinner-phase-zero.png', caseOverrides: { stabilization: { animations: 'none' } } });

    expect(run.check.status).toBe('fail');
    expect(run.check.metadata).toMatchObject({ classification: 'capture-stabilization-failed', captureError: { code: 'capture-unstable', classification: 'capture-stabilization-failed' } });
    expect((run.check.metadata.captureError as { evidence: { differingPixels: number } }).evidence.differingPixels).toBeGreaterThan(0);
    expect(run.check.artifacts.map((artifact) => artifact.role)).toEqual(['expected']);
  }, 40_000);

  it('lets a case opt out of verification explicitly', async () => {
    server.spinner = { raf: true };

    const run = await runCase({ baseUrl: server.baseUrl, story: 'spinner', baselineRoot, baseline: 'spinner-phase-zero.png', caseOverrides: { stabilization: { animations: 'none', verify: false } } });

    expect(run.check.metadata.captureError).toBeUndefined();
    expect(run.check.metadata.capturePolicy).toMatchObject({ stabilization: { verify: false } });
    expect(run.check.artifacts.some((artifact) => artifact.role === 'actual')).toBe(true);
  }, 40_000);

  it.each([
    ['geometry', { width: 60 }],
    ['colour', { color: '#ff0000' }],
    ['text', { text: 'Loadingg' }]
  ])('still fails the unchanged threshold for a %s defect under stabilization', async (_label, defect) => {
    server.spinner = defect;

    const run = await runCase({ baseUrl: server.baseUrl, story: 'spinner', baselineRoot, baseline: 'spinner-phase-zero.png', caseOverrides: { stabilization: { animations: 'none' } } });

    expect(run.check.status).toBe('fail');
    expect(run.check.metadata.diffPixels).toBeGreaterThan(0);
    expect(run.check.metadata.captureError).toBeUndefined();
  }, 40_000);

  it('does not invent a hover or focus state to stabilize a default capture', async () => {
    const run = await runCase({ baseUrl: server.baseUrl, story: 'spinner', baselineRoot, baseline: 'spinner-phase-zero.png', caseOverrides: { stabilization: { animations: 'none' } } });

    expect(run.check.metadata.capturePolicy).toMatchObject({ interaction: null });
    expect(run.check.metadata.captureOutcome).toMatchObject({ interaction: null });
    expect(run.check.metadata.browserState).toBeUndefined();
    expect(run.check.metadata.statePolicy).toBe('story-controlled');
  }, 40_000);
});

describe('policy identity and compatibility', () => {
  it('adds no policy metadata for an unconfigured case and leaves its artifacts alone', async () => {
    const run = await runCase({ baseUrl: server.baseUrl, story: 'pressable', baselineRoot, baseline: 'pressable-default.png' });

    expect(run.check.status).toBe('pass');
    expect(run.check.metadata.capturePolicy).toBeUndefined();
    expect(run.check.metadata.captureOutcome).toBeUndefined();
    expect(run.check.artifacts.map((artifact) => artifact.role)).toEqual(['expected', 'actual', 'diff']);
  }, 40_000);

  it('hashes the effective policy: equal policies match and any change differs', async () => {
    const hashOf = async (caseOverrides: Partial<ComponentVisualCase>) => {
      const run = await runCase({ baseUrl: server.baseUrl, story: 'pressable', baselineRoot, baseline: 'pressable-default.png', caseOverrides });
      return (run.check.metadata.capturePolicy as { hash: string }).hash;
    };

    const none = await hashOf({ stabilization: { animations: 'none' } });
    expect(await hashOf({ stabilization: { animations: 'none' } })).toBe(none);
    expect(await hashOf({ stabilization: { animations: 'settle' } })).not.toBe(none);
    expect(await hashOf({ stabilization: { animations: 'none', settleMs: 50 } })).not.toBe(none);
    expect(await hashOf({ stabilization: { animations: 'none', verify: false } })).not.toBe(none);
    expect(await hashOf({ stabilization: { animations: 'none' }, browserState: pressed })).not.toBe(none);
    expect(await hashOf({ stabilization: { animations: 'none' }, browserState: { kind: 'pressed', selector: '.btn', position: { x: 0.2, y: 0.2 } } })).not.toBe(none);
  }, 120_000);

  it('records the same policy hash in the check and in the outcome', async () => {
    const run = await runCase({ baseUrl: server.baseUrl, story: 'pressable', baselineRoot, baseline: 'pressable-default.png', caseOverrides: { stabilization: { animations: 'none' } } });
    const policy = run.check.metadata.capturePolicy as { hash: string; version: number };

    expect(policy.version).toBe(1);
    expect((run.check.metadata.captureOutcome as { policyHash: string }).policyHash).toBe(policy.hash);
  }, 40_000);
});
