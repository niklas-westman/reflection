import type { StorybookIndex } from './index-json.js';

export function resolveStoryUrl(index: StorybookIndex, baseUrl: string, storyId: string): string {
  const entry = index.entries[storyId];
  if (!entry || entry.type !== 'story') {
    throw new Error(
      `Reflection Storybook setup/config error: storyId "${storyId}" was not found or is not a story in ${new URL(
        'index.json',
        normalizeBaseUrl(baseUrl)
      ).toString()}`
    );
  }

  const url = new URL('iframe.html', normalizeBaseUrl(baseUrl));
  url.searchParams.set('id', entry.id);
  return url.toString();
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
}
