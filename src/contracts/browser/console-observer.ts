import type { Page } from 'playwright';

export type ConsoleErrorObserver = {
  errors: string[];
  dispose: () => void;
};

export function observeConsoleErrors(page: Page): ConsoleErrorObserver {
  const errors: string[] = [];
  const handler = (message: { type(): string; text(): string }) => {
    if (message.type() === 'error') {
      errors.push(message.text());
    }
  };

  page.on('console', handler);

  return {
    errors,
    dispose: () => page.off('console', handler)
  };
}
