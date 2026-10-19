import type { ReactNode } from 'react';
import type { SubjectViewMode } from '../../model/search';
import { Segmented } from '../atoms/segmented';

const VIEWS: Array<{ mode: SubjectViewMode; label: string }> = [
  { mode: 'gallery', label: 'Visual gallery' },
  { mode: 'items', label: 'All required items' },
  { mode: 'changes', label: 'Changes' }
];

/** The few views of one subject. Variant, state and size are filters inside a view, never views of their own. */
export function ViewSwitcher({ mode, onChange, changesUnavailable }: { mode: SubjectViewMode; onChange: (mode: SubjectViewMode) => void; changesUnavailable: string | undefined }): ReactNode {
  return (
    <Segmented role="group" aria-label="View">
      {VIEWS.map((view) => (
        <button key={view.mode} type="button" aria-pressed={mode === view.mode} disabled={view.mode === 'changes' && changesUnavailable !== undefined} title={view.mode === 'changes' ? changesUnavailable : undefined} onClick={() => onChange(view.mode)}>
          {view.label}
        </button>
      ))}
    </Segmented>
  );
}
