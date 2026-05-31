import type { Page } from 'playwright';
import { getHorizontalOverflow } from './overflow-check.js';

export type BrowserExpectation =
  | { urlIncludes: string }
  | { urlEquals: string }
  | { role: string; name?: string | undefined }
  | { label: string }
  | { text: string }
  | { noText: string }
  | { selector: string }
  | { elementVisible: string }
  | { elementNotVisible: string }
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
    const locator = page.getByRole(expectation.role as never, expectation.name ? { name: expectation.name } : undefined);
    if ((await locator.count()) === 0) {
      return { classification: 'dom-contract-failure', summary: `Expected role ${expectation.role}${expectation.name ? ` named ${expectation.name}` : ''}.` };
    }
    return undefined;
  }

  if ('label' in expectation) {
    if ((await page.getByLabel(expectation.label).count()) === 0) {
      return { classification: 'dom-contract-failure', summary: `Expected label ${expectation.label}.` };
    }
    return undefined;
  }

  if ('text' in expectation) {
    if ((await page.getByText(expectation.text).count()) === 0) {
      return { classification: 'dom-contract-failure', summary: `Expected text ${expectation.text}.` };
    }
    return undefined;
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

export function shouldCaptureScreenshot(expectations: BrowserExpectation[]): boolean {
  return expectations.some((expectation) => 'screenshot' in expectation);
}
