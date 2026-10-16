import type { Page } from 'playwright';
import { CaptureStateError } from './capture-errors.js';
import type { EffectiveInteraction } from './capture-policy.js';

export interface PressedEvidence {
  kind: 'pressed';
  selector: string;
  position: { fractionX: number; fractionY: number; x: number; y: number };
  targetBox: { x: number; y: number; width: number; height: number };
  hit: { tag: string; id: string | null; isTarget: boolean; isDescendant: boolean };
  after: { matchesActive: boolean; matchesHover: boolean; targetOrDescendantFocused: boolean };
  established: true;
}

export interface ReleaseEvidence {
  released: boolean;
  alreadyReleased: boolean;
  activeAfterRelease: boolean | null;
}

export interface PressedHandle {
  evidence: PressedEvidence;
  release(): Promise<ReleaseEvidence>;
}

/**
 * Holds the primary mouse button down on the target with real browser input and verifies the target is :active
 * before returning. The caller must call release() on success and failure.
 *
 * The pointer lands at a fraction of the target's box. The element under the pointer must be the target or one of its
 * descendants: pressing a label or icon inside a button is a press of the button. Anything else under that point
 * (an overlay, pointer-events: none) fails explicitly instead of pressing something other than the target.
 */
export async function pressTarget(page: Page, interaction: EffectiveInteraction): Promise<PressedHandle> {
  const { selector } = interaction;
  const locator = page.locator(selector);
  const matchCount = await locator.count();
  if (matchCount === 0) {
    throw fail('target-not-found', `Pressed target ${selector} matched no element.`, { selector });
  }
  if (matchCount > 1) {
    throw fail('target-not-unique', `Pressed target ${selector} matched ${matchCount} elements; it must match exactly one.`, { selector, matchCount });
  }

  if (!(await locator.isVisible())) {
    throw fail('target-not-visible', `Pressed target ${selector} is not visible.`, { selector });
  }
  if (!(await locator.isEnabled())) {
    throw fail('target-disabled', `Pressed target ${selector} is disabled, so it cannot be pressed.`, { selector });
  }

  const box = await locator.boundingBox();
  if (!box || box.width <= 0 || box.height <= 0) {
    throw fail('target-no-box', `Pressed target ${selector} has no rendered box.`, { selector });
  }

  const viewport = page.viewportSize();
  const point = { x: box.x + box.width * interaction.position.x, y: box.y + box.height * interaction.position.y };
  if (!viewport || point.x < 0 || point.y < 0 || point.x >= viewport.width || point.y >= viewport.height) {
    throw fail('target-outside-viewport', `The pointer position for ${selector} is outside the viewport.`, { selector, point, viewport });
  }

  const hit = await locator.evaluate((target, position) => {
    const root = target.getRootNode() as Document | ShadowRoot;
    const scope = typeof root.elementFromPoint === 'function' ? root : document;
    const element = scope.elementFromPoint(position.x, position.y);
    return {
      tag: element ? element.tagName.toLowerCase() : 'none',
      id: element ? element.id || null : null,
      isTarget: element === target,
      isDescendant: element !== null && element !== target && target.contains(element)
    };
  }, point);
  if (!hit.isTarget && !hit.isDescendant) {
    throw fail('target-obscured', `At the pointer position the element under the pointer is <${hit.tag}>, not ${selector} or one of its descendants (obscured or pointer-events: none).`, { selector, point, hit });
  }

  await page.mouse.move(point.x, point.y);
  await page.mouse.down({ button: 'left' });
  let held = true;
  const release = async (): Promise<ReleaseEvidence> => {
    if (!held) {
      return { released: true, alreadyReleased: true, activeAfterRelease: null };
    }
    held = false;
    try {
      // Moving off the target first means releasing does not click it: this is a capture, not an activation.
      await page.mouse.move(-1, -1);
      await page.mouse.up({ button: 'left' });
    } catch {
      return { released: false, alreadyReleased: false, activeAfterRelease: null };
    }
    const activeAfterRelease = await locator.evaluate((target) => target.matches(':active')).catch(() => null);
    return { released: true, alreadyReleased: false, activeAfterRelease };
  };

  try {
    const after = await locator.evaluate((target) => ({
      matchesActive: target.matches(':active'),
      matchesHover: target.matches(':hover'),
      targetOrDescendantFocused: target.contains(document.activeElement)
    }));
    if (!after.matchesActive) {
      throw fail('active-state-not-established', `Pressed target ${selector} is not :active while the pointer is held down.`, { selector, point, hit, after });
    }

    return {
      evidence: {
        kind: 'pressed',
        selector,
        position: { fractionX: interaction.position.x, fractionY: interaction.position.y, x: point.x, y: point.y },
        targetBox: box,
        hit,
        after,
        established: true
      },
      release
    };
  } catch (error) {
    await release();
    throw error;
  }
}

function fail(code: string, message: string, evidence: Record<string, unknown>): CaptureStateError {
  return new CaptureStateError('capture-state-not-established', code, message, evidence);
}
