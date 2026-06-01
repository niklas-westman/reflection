import { z } from 'zod';

const StorybookEntrySchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  name: z.string().min(1),
  type: z.string().min(1),
  importPath: z.string().optional()
});

const StorybookIndexSchema = z.object({
  entries: z.record(z.string(), StorybookEntrySchema)
});

export type StorybookEntry = z.output<typeof StorybookEntrySchema>;
export type StorybookIndex = z.output<typeof StorybookIndexSchema>;

export async function loadStorybookIndex(baseUrl: string): Promise<StorybookIndex> {
  const indexUrl = new URL('index.json', normalizeBaseUrl(baseUrl));
  let response: Response;

  try {
    response = await fetch(indexUrl, { cache: 'no-store' });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Reflection Storybook setup/config error: failed to load ${indexUrl.toString()}: ${message}`);
  }

  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(
      `Reflection Storybook setup/config error: failed to load ${indexUrl.toString()}: HTTP ${response.status}`
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Reflection Storybook setup/config error: invalid JSON from ${indexUrl.toString()}: ${message}`);
  }

  const parsed = StorybookIndexSchema.safeParse(payload);
  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => `${issue.path.join('.') || 'index'}: ${issue.message}`).join('; ');
    throw new Error(`Reflection Storybook setup/config error: invalid ${indexUrl.toString()}: ${details}`);
  }

  return parsed.data;
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
}
