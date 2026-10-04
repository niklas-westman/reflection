import type { Locator, Page } from 'playwright';
import type { BrowserStep } from '../../core/browser-scenario.js';

export interface StepFailure {
  index: number;
  description: string;
  message: string;
}

const defaultStepTimeoutMs = 5_000;

export async function runSteps(page: Page, steps: BrowserStep[]): Promise<StepFailure | undefined> {
  for (const [index, step] of steps.entries()) {
    try {
      await runStep(page, step);
    } catch (error) {
      return { index: index + 1, description: describeStep(step), message: firstLine(error instanceof Error ? error.message : String(error)) };
    }
  }

  return undefined;
}

export function describeStep(step: BrowserStep): string {
  if ('click' in step) {
    return `click ${describeTarget(step.click)}`;
  }

  if ('fill' in step) {
    const { value: _value, ...target } = step.fill;
    return `fill ${describeTarget(target)}`;
  }

  if ('press' in step) {
    return `press ${step.press}`;
  }

  const { timeoutMs: _timeoutMs, ...target } = step.waitFor;
  return `waitFor ${describeTarget(target)}`;
}

async function runStep(page: Page, step: BrowserStep): Promise<void> {
  if ('click' in step) {
    await locate(page, step.click).click({ timeout: defaultStepTimeoutMs });
    return;
  }

  if ('fill' in step) {
    await locate(page, step.fill).fill(step.fill.value, { timeout: defaultStepTimeoutMs });
    return;
  }

  if ('press' in step) {
    await page.keyboard.press(step.press);
    return;
  }

  const timeout = step.waitFor.timeoutMs ?? defaultStepTimeoutMs;
  if ('networkIdle' in step.waitFor) {
    await page.waitForLoadState('networkidle', { timeout });
    return;
  }

  await locate(page, step.waitFor).first().waitFor({ state: 'visible', timeout });
}

type LocatorTarget =
  | { role: string; name?: string | undefined; exact?: boolean | undefined }
  | { label: string; exact?: boolean | undefined }
  | { text: string; exact?: boolean | undefined }
  | { selector: string };

// Role and label targets are exact by default so "Password" cannot match a "Show password" toggle; text stays a substring match.
function locate(page: Page, target: LocatorTarget): Locator {
  if ('role' in target) {
    return page.getByRole(target.role as never, target.name ? { name: target.name, exact: target.exact ?? true } : undefined);
  }

  if ('label' in target) {
    return page.getByLabel(target.label, { exact: target.exact ?? true });
  }

  if ('text' in target) {
    return page.getByText(target.text, { exact: target.exact ?? false });
  }

  return page.locator(target.selector);
}

function describeTarget(target: object): string {
  return Object.entries(target)
    .map(([key, value]) => (typeof value === 'string' ? `${key}=${JSON.stringify(value)}` : `${key}=${String(value)}`))
    .join(' ');
}

function firstLine(message: string): string {
  return message.split('\n')[0] ?? message;
}
