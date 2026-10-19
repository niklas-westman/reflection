import type { ReactNode } from 'react';
import type { SubjectViewMode } from '../../model/search';
import { Segmented } from '../atoms/segmented';

const VIEWS: Array<{ mode: SubjectViewMode; label: string; disabledReason?: string }> = [
  { mode: 'gallery', label: 'Visual gallery' },
  { mode: 'items', label: 'All required items' },
  { mode: 'changes', label: 'Changes', disabledReason: 'Changes need a previous release to compare with, which is not available yet' }
];

/** The few views of one subject. Variant, state and size are filters inside a view, never views of their own. */
export function ViewSwitcher({ mode, onChange }: { mode: SubjectViewMode; onChange: (mode: SubjectViewMode) => void }): ReactNode {
  return (
    <Segmented role="group" aria-label="View">
      {VIEWS.map((view) => (
        <button key={view.mode} type="button" aria-pressed={mode === view.mode} disabled={view.disabledReason !== undefined} title={view.disabledReason} onClick={() => onChange(view.mode)}>
          {view.label}
        </button>
      ))}
    </Segmented>
  );
}
