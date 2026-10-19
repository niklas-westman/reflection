import type { ReactNode } from 'react';
import type { SubjectViewMode } from '../../model/search';
import { Segmented } from '../atoms/segmented';

// The subject's own Changes view is named for the subject, so it is not mistaken for the release's Changes page.
function viewsFor(subjectKind: 'component' | 'page'): Array<{ mode: SubjectViewMode; label: string }> {
  return [
    { mode: 'gallery', label: 'Visual gallery' },
    { mode: 'items', label: 'All required items' },
    { mode: 'changes', label: `Changes on this ${subjectKind}` }
  ];
}

/** The few views of one subject. Variant, state and size are filters inside a view, never views of their own. */
export function ViewSwitcher({ mode, subjectKind, onChange, changesUnavailable }: { mode: SubjectViewMode; subjectKind: 'component' | 'page'; onChange: (mode: SubjectViewMode) => void; changesUnavailable: string | undefined }): ReactNode {
  return (
    <Segmented role="group" aria-label="View">
      {viewsFor(subjectKind).map((view) => (
        <button key={view.mode} type="button" aria-pressed={mode === view.mode} disabled={view.mode === 'changes' && changesUnavailable !== undefined} title={view.mode === 'changes' ? changesUnavailable : undefined} onClick={() => onChange(view.mode)}>
          {view.label}
        </button>
      ))}
    </Segmented>
  );
}
