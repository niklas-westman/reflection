import type { ReactNode } from 'react';
import type { Readiness } from 'reflection-projection';
import type { MatrixCell } from '../../model/matrix-model';
import { StatusGlyph, type GlyphKind } from './status-glyph';

export interface StatusDisplay {
  glyph: GlyphKind;
  text: string;
}

/** How a result cell reads. An unusable file makes the outcome unknown, whatever was recorded. */
export const CELL_DISPLAY: Record<MatrixCell['outcome'] | 'unusable', StatusDisplay> = {
  passed: { glyph: 'passed', text: 'Passed' },
  failed: { glyph: 'failed', text: 'Failed' },
  'not-run': { glyph: 'not-run', text: 'Not run' },
  none: { glyph: 'not-run', text: 'Not compared' },
  unusable: { glyph: 'unknown', text: 'Unknown: evidence unusable' }
};

export const READINESS_DISPLAY: Record<Readiness, StatusDisplay> = {
  proven: { glyph: 'passed', text: 'Proven' },
  failing: { glyph: 'failed', text: 'Failing' },
  'needs-design': { glyph: 'gap', text: 'Needs design' },
  'not-enrolled': { glyph: 'gap', text: 'Not enrolled' },
  unknown: { glyph: 'unknown', text: 'Not proven' }
};

export function cellDisplay(outcome: MatrixCell['outcome'], unusable: boolean): StatusDisplay {
  return CELL_DISPLAY[unusable ? 'unusable' : outcome];
}

/** A glyph with its words: status is never colour or shape alone. */
export function StatusLabel({ display }: { display: StatusDisplay }): ReactNode {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem' }}>
      <StatusGlyph kind={display.glyph} label="" />
      {display.text}
    </span>
  );
}
