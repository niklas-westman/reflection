import { z } from 'zod';
import { idSchema, timestampSchema } from './primitives.js';

const noteEventBase = { id: idSchema, by: z.string().min(1), at: timestampSchema };

// Notes are append-only records. Nothing is edited: a note is added, then possibly resolved or retracted.
// A note never changes an outcome, a proof result or a decision.
export const noteEventSchema = z.discriminatedUnion('type', [
  z.object({
    ...noteEventBase,
    type: z.literal('note-added'),
    release: z.string().min(1),
    // The family is always required; the item and the implementation narrow it down when the writer wants to.
    family: z.string().min(1),
    requirementId: idSchema.optional(),
    implementation: z.string().min(1).optional(),
    // The build the note was written on. A note still open on a later build is carried forward.
    bundleId: idSchema,
    text: z.string().min(1).max(4000)
  }),
  z.object({ ...noteEventBase, type: z.literal('note-resolved'), target: idSchema }),
  z.object({ ...noteEventBase, type: z.literal('note-retracted'), target: idSchema })
]);
export type NoteEvent = z.output<typeof noteEventSchema>;

export type NoteStatus = 'open' | 'resolved' | 'retracted';

export interface Note {
  id: string;
  release: string;
  family: string;
  requirementId?: string;
  implementation?: string;
  bundleId: string;
  by: string;
  at: string;
  text: string;
  status: NoteStatus;
  closedBy?: string;
  closedAt?: string;
}

/**
 * The notes as they stand, folded from the event log in time order. A repeated id, an event aimed at an unknown
 * note and a second resolution are ignored; a retraction is final.
 */
export function foldNotes(events: NoteEvent[]): Note[] {
  const ordered = events.map((event, index) => ({ event, index })).sort((a, b) => a.event.at.localeCompare(b.event.at) || a.index - b.index);
  const notes = new Map<string, Note>();

  for (const { event } of ordered) {
    if (event.type === 'note-added') {
      if (!notes.has(event.id)) {
        notes.set(event.id, toNote(event));
      }
      continue;
    }

    const target = notes.get(event.target);
    if (!target || target.status === 'retracted') {
      continue;
    }
    if (event.type === 'note-retracted') {
      close(target, 'retracted', event);
    } else if (target.status === 'open') {
      close(target, 'resolved', event);
    }
  }

  return [...notes.values()];
}

export interface NoteCounts {
  open: number;
  resolved: number;
}

/** Open and resolved counts. A retracted note counts as neither. */
export function countNotes(notes: Note[]): NoteCounts {
  return {
    open: notes.filter((note) => note.status === 'open').length,
    resolved: notes.filter((note) => note.status === 'resolved').length
  };
}

function toNote(event: Extract<NoteEvent, { type: 'note-added' }>): Note {
  return {
    id: event.id,
    release: event.release,
    family: event.family,
    ...(event.requirementId ? { requirementId: event.requirementId } : {}),
    ...(event.implementation ? { implementation: event.implementation } : {}),
    bundleId: event.bundleId,
    by: event.by,
    at: event.at,
    text: event.text,
    status: 'open'
  };
}

function close(note: Note, status: 'resolved' | 'retracted', event: { by: string; at: string }): void {
  note.status = status;
  note.closedBy = event.by;
  note.closedAt = event.at;
}
