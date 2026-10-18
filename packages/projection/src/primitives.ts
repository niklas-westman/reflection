import { z } from 'zod';

export const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/, 'expected a lowercase sha256 hex digest');

export const timestampSchema = z.string().datetime();

export const idSchema = z.string().min(1).max(512);

// A path inside a bundle or run directory. Absolute paths and parent traversal are rejected so a reader
// can resolve artifacts only under an approved root.
export const relativePathSchema = z
  .string()
  .min(1)
  .refine((value) => !value.startsWith('/') && !value.startsWith('\\') && !/^[A-Za-z]:/.test(value), { message: 'path must be relative' })
  .refine((value) => !value.split(/[\\/]/).includes('..'), { message: 'path must not contain ".."' });
