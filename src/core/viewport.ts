import { z } from 'zod';

export const viewportPresetNames = ['desktop', 'mobile', 'tablet', 'component'] as const;

export interface ViewportSize {
  width: number;
  height: number;
}

export interface CustomRouteViewport extends ViewportSize {
  name: string;
}

export type RouteViewport = string | CustomRouteViewport;

export const ViewportSizeSchema = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive()
});

const CustomRouteViewportSchema = ViewportSizeSchema.extend({
  name: z.string().min(1)
});

export const RouteViewportSchema = z.union([z.string().min(1), CustomRouteViewportSchema]);

export const RouteViewportsSchema = z.array(RouteViewportSchema).default(['desktop']).superRefine((viewports, context) => {
  const seen = new Set<string>();
  for (const [index, viewport] of viewports.entries()) {
    const name = getRouteViewportName(viewport);

    if (seen.has(name)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: [index], message: `duplicate viewport name "${name}"` });
    }
    seen.add(name);

    if (typeof viewport !== 'string' && isViewportPresetName(name)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [index, 'name'],
        message: `custom viewport name "${name}" collides with a built-in preset; choose a different name`
      });
    }
  }
});

export function getRouteViewportName(viewport: RouteViewport): string {
  return typeof viewport === 'string' ? viewport : viewport.name;
}

export function isCustomRouteViewport(viewport: RouteViewport): viewport is CustomRouteViewport {
  return typeof viewport !== 'string';
}

function isViewportPresetName(name: string): boolean {
  return (viewportPresetNames as readonly string[]).includes(name);
}
