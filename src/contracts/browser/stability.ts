import type { Page, PageScreenshotOptions } from 'playwright';
import type { BrowserStability } from '../../core/browser-scenario.js';

const imageWaitTimeoutMs = 5_000;

export interface ResolvedStability {
  disableAnimations: boolean;
  hideCaret: boolean;
  waitFor: Array<'fonts' | 'images'>;
  settleMs: number;
}

export function resolveStability(...layers: Array<BrowserStability | undefined>): ResolvedStability {
  const merged = Object.assign({}, ...layers.map((layer) => layer ?? {})) as BrowserStability;
  return {
    disableAnimations: merged.disableAnimations ?? false,
    hideCaret: merged.hideCaret ?? true,
    waitFor: merged.waitFor ?? ['fonts', 'images'],
    settleMs: merged.settleMs ?? 0
  };
}

export function screenshotStabilityOptions(stability: ResolvedStability): Pick<PageScreenshotOptions, 'animations' | 'caret'> {
  return {
    animations: stability.disableAnimations ? 'disabled' : 'allow',
    caret: stability.hideCaret ? 'hide' : 'initial'
  };
}

export async function waitForPageStability(page: Page, stability: ResolvedStability): Promise<void> {
  if (stability.waitFor.includes('fonts')) {
    await page.evaluate(async () => {
      const documentLike = (globalThis as unknown as { document: { fonts?: { ready: Promise<unknown> } } }).document;
      await documentLike.fonts?.ready;
    });
  }

  if (stability.waitFor.includes('images')) {
    await page.evaluate(async (timeoutMs) => {
      interface ImageLike {
        complete: boolean;
        loading: string;
        decode(): Promise<void>;
        addEventListener(type: string, listener: () => void, options: { once: boolean }): void;
      }
      const documentLike = (globalThis as unknown as { document: { images: ArrayLike<ImageLike> } }).document;
      const settleImage = (image: ImageLike): Promise<unknown> => {
        if (image.complete) {
          return image.decode().catch(() => undefined);
        }
        // Lazy images below the fold never load on their own, so they must not block the screenshot.
        if (image.loading === 'lazy') {
          return Promise.resolve();
        }
        return new Promise((done) => {
          image.addEventListener('load', () => done(undefined), { once: true });
          image.addEventListener('error', () => done(undefined), { once: true });
        });
      };
      const timeout = new Promise((done) => setTimeout(done, timeoutMs));
      await Promise.race([Promise.all(Array.from(documentLike.images).map(settleImage)), timeout]);
    }, imageWaitTimeoutMs);
  }

  if (stability.settleMs > 0) {
    await page.waitForTimeout(stability.settleMs);
  }
}
