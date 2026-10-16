import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import type { Page } from 'playwright';
import { CaptureStateError } from './capture-errors.js';
import type { EffectiveStabilization } from './capture-policy.js';

export interface SettleEvidence {
  method: EffectiveStabilization['method'];
  source: EffectiveStabilization['source'];
  settleMs: number;
  // Web Animations only: how many animations were driven to their end state or cancelled, and how many still run.
  finished?: number;
  cancelled?: number;
  passes?: number;
  stillRunning?: number;
}

export interface VerificationEvidence {
  verified: true;
  delayMs: number;
  identical: true;
}

const noMotionStyle = '*, *::before, *::after { animation: none !important; transition: none !important; }';

/**
 * css-none: removes CSS animations and transitions. Elements render in their un-animated base style, which is a
 * deterministic phase zero. Installed before any interaction so a forced state applies instantly. It does not control
 * Web Animations, canvas, video, requestAnimationFrame loops or JavaScript timers.
 */
export async function installPreInteractionStabilization(page: Page, stabilization: EffectiveStabilization): Promise<void> {
  if (stabilization.method === 'css-none') {
    await page.addStyleTag({ content: noMotionStyle });
  }
}

/**
 * web-animations-settle: after the interaction, drives every Web Animation (CSS animations, CSS transitions and
 * element.animate(), including pseudo-elements and open shadow roots) to a deterministic state: finite animations are
 * finished to their end state and infinite ones are cancelled to their un-animated state. Repeats a few passes because
 * finishing one animation can start another. Unsuccessful when animations are still running afterwards.
 */
export async function settleAfterInteraction(page: Page, stabilization: EffectiveStabilization): Promise<SettleEvidence> {
  const evidence: SettleEvidence = { method: stabilization.method, source: stabilization.source, settleMs: stabilization.settleMs };
  if (stabilization.method === 'web-animations-settle') {
    // No named inner functions: bundlers that keep function names would inject helpers that do not exist in the page.
    const result = await page.evaluate(async () => {
      const roots: Array<Document | ShadowRoot> = [document];
      const all = document.querySelectorAll('*');
      for (let index = 0; index < all.length && index < 20_000; index += 1) {
        const shadow = (all[index] as Element).shadowRoot;
        if (shadow) {
          roots.push(shadow);
        }
      }

      let finished = 0;
      let cancelled = 0;
      let passes = 0;
      for (; passes < 5; passes += 1) {
        const animations = roots.flatMap((root) => root.getAnimations());
        if (animations.length === 0) {
          break;
        }
        for (const animation of animations) {
          const endTime = animation.effect ? animation.effect.getComputedTiming().endTime : 0;
          if (endTime === Infinity) {
            animation.cancel();
            cancelled += 1;
          } else {
            animation.finish();
            finished += 1;
          }
        }
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      }

      const stillRunning = roots.flatMap((root) => root.getAnimations()).filter((animation) => animation.playState === 'running').length;
      return { finished, cancelled, passes, stillRunning };
    });
    Object.assign(evidence, result);
    if (result.stillRunning > 0) {
      throw new CaptureStateError('capture-stabilization-failed', 'animations-still-running', `${result.stillRunning} animation(s) were still running after the settle passes, so the capture cannot be made deterministic.`, { ...evidence });
    }
  }

  if (stabilization.settleMs > 0) {
    await page.waitForTimeout(stabilization.settleMs);
  }

  return evidence;
}

/**
 * Captures a second time after a short delay and requires identical pixels. This is what notices motion the CSS and
 * Web Animations controls cannot reach (canvas, video, requestAnimationFrame, JavaScript timers): the capture fails
 * explicitly instead of recording an arbitrary phase.
 */
export async function verifyStableCapture(page: Page, first: Buffer, stabilization: EffectiveStabilization, screenshotOptions: Parameters<Page['screenshot']>[0]): Promise<VerificationEvidence> {
  if (stabilization.verifyDelayMs > 0) {
    await page.waitForTimeout(stabilization.verifyDelayMs);
  }

  const second = await page.screenshot(screenshotOptions);
  if (first.equals(second)) {
    return { verified: true, delayMs: stabilization.verifyDelayMs, identical: true };
  }

  const differing = countDifferingPixels(first, second);
  if (differing === 0) {
    // Different PNG bytes, identical decoded pixels.
    return { verified: true, delayMs: stabilization.verifyDelayMs, identical: true };
  }

  throw new CaptureStateError(
    'capture-stabilization-failed',
    'capture-unstable',
    `Two captures ${stabilization.verifyDelayMs}ms apart differ by ${differing} pixel(s) under the ${stabilization.method} policy. Something on the page is still moving that this policy does not control.`,
    { method: stabilization.method, delayMs: stabilization.verifyDelayMs, differingPixels: differing }
  );
}

function countDifferingPixels(first: Buffer, second: Buffer): number {
  const a = PNG.sync.read(first);
  const b = PNG.sync.read(second);
  if (a.width !== b.width || a.height !== b.height) {
    return a.width * a.height;
  }
  return pixelmatch(a.data, b.data, undefined, a.width, a.height, { threshold: 0 });
}
