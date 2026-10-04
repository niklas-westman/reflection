import type { Locator, Page } from 'playwright';
import { getHorizontalOverflow } from './overflow-check.js';

export type BrowserExpectation =
  | { urlIncludes: string }
  | { urlEquals: string }
  | { role: string; name?: string | undefined; exact?: boolean | undefined; visible?: boolean | undefined; enabled?: boolean | undefined }
  | { label: string; exact?: boolean | undefined; visible?: boolean | undefined; enabled?: boolean | undefined }
  | { text: string; exact?: boolean | undefined; visible?: boolean | undefined }
  | { noText: string }
  | { selector: string }
  | { elementVisible: string }
  | { elementNotVisible: string }
  | { selectorCount: { selector: string; equals: number } }
  | { noSelector: string }
  | { noHorizontalOverflow: true }
  | { noConsoleErrors: true }
  | { screenshot: string };

export type AssertionFailure = {
  classification: string;
  summary: string;
  details?: string;
};

export async function evaluateExpectation(
  page: Page,
  expectation: BrowserExpectation,
  consoleErrors: string[]
): Promise<AssertionFailure | undefined> {
  if ('screenshot' in expectation) {
    return undefined;
  }

  if ('urlIncludes' in expectation) {
    if (!page.url().includes(expectation.urlIncludes)) {
      return { classification: 'route-failure', summary: `Expected URL to include ${expectation.urlIncludes}.`, details: page.url() };
    }
    return undefined;
  }

  if ('urlEquals' in expectation) {
    if (page.url() !== expectation.urlEquals) {
      return { classification: 'route-failure', summary: `Expected URL to equal ${expectation.urlEquals}.`, details: page.url() };
    }
    return undefined;
  }

  if ('role' in expectation) {
    // Named roles match exactly unless exact: false, so "Sign in" does not accept "Sign in elsewhere".
    // Playwright excludes hidden elements from role queries by default; visible: false has to opt back in.
    const includeHidden = expectation.visible === false;
    const locator = page.getByRole(expectation.role as never, expectation.name ? { name: expectation.name, exact: expectation.exact ?? true, includeHidden } : { includeHidden });
    return evaluateMatches(locator, describeExpectation(expectation), { visible: expectation.visible ?? true, enabled: expectation.enabled ?? false });
  }

  if ('label' in expectation) {
    const locator = page.getByLabel(expectation.label, { exact: expectation.exact ?? true });
    return evaluateMatches(locator, describeExpectation(expectation), { visible: expectation.visible ?? true, enabled: expectation.enabled ?? false });
  }

  if ('text' in expectation) {
    const locator = page.getByText(expectation.text, { exact: expectation.exact ?? false });
    return evaluateMatches(locator, describeExpectation(expectation), { visible: expectation.visible ?? true, enabled: false });
  }

  if ('noText' in expectation) {
    if ((await page.getByText(expectation.noText).count()) > 0) {
      return { classification: 'dom-contract-failure', summary: `Unexpected text ${expectation.noText}.` };
    }
    return undefined;
  }

  if ('selector' in expectation) {
    if ((await page.locator(expectation.selector).count()) === 0) {
      return { classification: 'dom-contract-failure', summary: `Expected selector ${expectation.selector}.` };
    }
    return undefined;
  }

  if ('elementVisible' in expectation) {
    if (!(await page.locator(expectation.elementVisible).first().isVisible().catch(() => false))) {
      return { classification: 'dom-contract-failure', summary: `Expected visible element ${expectation.elementVisible}.` };
    }
    return undefined;
  }

  if ('elementNotVisible' in expectation) {
    if (await page.locator(expectation.elementNotVisible).first().isVisible().catch(() => false)) {
      return { classification: 'dom-contract-failure', summary: `Expected hidden or absent element ${expectation.elementNotVisible}.` };
    }
    return undefined;
  }

  if ('selectorCount' in expectation) {
    const actual = await page.locator(expectation.selectorCount.selector).count();
    if (actual !== expectation.selectorCount.equals) {
      return {
        classification: 'dom-contract-failure',
        summary: `Expected selector ${expectation.selectorCount.selector} to match ${expectation.selectorCount.equals} element${expectation.selectorCount.equals === 1 ? '' : 's'}, found ${actual}.`
      };
    }
    return undefined;
  }

  if ('noSelector' in expectation) {
    const actual = await page.locator(expectation.noSelector).count();
    if (actual > 0) {
      return {
        classification: 'dom-contract-failure',
        summary: `Unexpected selector ${expectation.noSelector} matched ${actual} element${actual === 1 ? '' : 's'}.`
      };
    }
    return undefined;
  }

  if ('noHorizontalOverflow' in expectation) {
    const overflow = await getHorizontalOverflow(page);
    if (overflow.hasOverflow) {
      return {
        classification: 'layout-overflow',
        summary: `Page has horizontal overflow: scroll width ${overflow.scrollWidth}px exceeds viewport ${overflow.viewportWidth}px.`,
        details: JSON.stringify(overflow)
      };
    }
    return undefined;
  }

  if ('noConsoleErrors' in expectation) {
    if (consoleErrors.length > 0) {
      return {
        classification: 'console-error',
        summary: `Page emitted ${consoleErrors.length} console error${consoleErrors.length === 1 ? '' : 's'}.`,
        details: consoleErrors.join('\n')
      };
    }
    return undefined;
  }

  return undefined;
}

async function evaluateMatches(
  locator: Locator,
  description: string,
  requirements: { visible: boolean; enabled: boolean }
): Promise<AssertionFailure | undefined> {
  const total = await locator.count();
  if (total === 0) {
    return { classification: 'dom-contract-failure', summary: `Expected ${description}, but nothing matched.` };
  }

  let matched = 0;
  for (let index = 0; index < total; index += 1) {
    const candidate = locator.nth(index);
    if (requirements.visible && !(await candidate.isVisible().catch(() => false))) {
      continue;
    }
    if (requirements.enabled && !(await candidate.isEnabled().catch(() => false))) {
      continue;
    }
    matched += 1;
  }

  if (matched > 0) {
    return undefined;
  }

  const unmet = [requirements.visible ? 'visible' : undefined, requirements.enabled ? 'enabled' : undefined].filter(Boolean).join(' and ');
  return {
    classification: 'dom-contract-failure',
    summary: `Expected ${description}, but none of the ${total} matching element${total === 1 ? ' was' : 's were'} ${unmet}.`
  };
}

export function describeExpectation(expectation: BrowserExpectation): string {
  if ('role' in expectation) {
    return `${requirementPrefix(expectation, true)}role ${expectation.role}${expectation.name ? ` named ${JSON.stringify(expectation.name)}${(expectation.exact ?? true) ? ' (exact)' : ' (substring)'}` : ''}`;
  }

  if ('label' in expectation) {
    return `${requirementPrefix(expectation, true)}label ${JSON.stringify(expectation.label)}${(expectation.exact ?? true) ? ' (exact)' : ' (substring)'}`;
  }

  if ('text' in expectation) {
    return `${requirementPrefix(expectation, false)}text ${JSON.stringify(expectation.text)}${expectation.exact ? ' (exact)' : ' (substring)'}`;
  }

  const [kind, value] = Object.entries(expectation)[0] ?? ['expectation', ''];
  return `${kind} ${typeof value === 'object' ? JSON.stringify(value) : String(value)}`;
}

function requirementPrefix(expectation: { visible?: boolean | undefined; enabled?: boolean | undefined }, supportsEnabled: boolean): string {
  const parts = [(expectation.visible ?? true) ? 'visible' : undefined, supportsEnabled && expectation.enabled ? 'enabled' : undefined].filter(Boolean);
  return parts.length > 0 ? `${parts.join(' ')} ` : '';
}

export function shouldCaptureScreenshot(expectations: BrowserExpectation[]): boolean {
  return expectations.some((expectation) => 'screenshot' in expectation);
}
