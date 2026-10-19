import { z } from 'zod';
import { idSchema } from './primitives.js';

// A link a provider supplies to the design source. Only http and https: a bundle never carries a script URL.
export const httpUrlSchema = z
  .string()
  .url()
  .refine((value) => /^https?:\/\//i.test(value), { message: 'must be an http or https URL' });

// What a provider can say about a subject (a component family, a page) beyond its id. Every field is optional:
// a viewer shows the id when there is no label, and shows no link when there is no URL.
export const subjectInfoSchema = z.object({
  id: idSchema,
  kind: z.enum(['component', 'page']),
  label: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  sourceUrl: httpUrlSchema.optional(),
  // What changed in this subject in this release, in the provider's words. Never derived, never required.
  changeNote: z.string().min(1).optional()
});
export type SubjectInfo = z.output<typeof subjectInfoSchema>;
