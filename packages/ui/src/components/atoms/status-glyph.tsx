import type { ReactNode } from 'react';
import styled from 'styled-components';

export type GlyphKind = 'passed' | 'failed' | 'gap' | 'not-run' | 'invalid' | 'unknown';

const LABELS: Record<GlyphKind, string> = {
  passed: 'Passed',
  failed: 'Failed',
  gap: 'Gap',
  'not-run': 'Not run',
  invalid: 'Invalid',
  unknown: 'Unknown'
};

const COLORS: Record<GlyphKind, string> = {
  passed: 'var(--pass)',
  failed: 'var(--fail)',
  gap: 'var(--gap)',
  'not-run': 'var(--idle)',
  invalid: 'var(--fail)',
  unknown: 'var(--idle)'
};

const Svg = styled.svg<{ $kind: GlyphKind }>`
  flex: none;
  width: 1rem;
  height: 1rem;
  color: ${({ $kind }) => COLORS[$kind]};
`;

// Each state has its own shape, so colour is never the only signal.
const SHAPES: Record<GlyphKind, ReactNode> = {
  passed: <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />,
  failed: <path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />,
  gap: <path d="M8 2.5l6 10.5H2z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />,
  'not-run': <circle cx="8" cy="8" r="5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeDasharray="2.4 2" />,
  invalid: (
    <>
      <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8 4.5v4M8 11v.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </>
  ),
  unknown: (
    <>
      <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M6.2 6.3a1.9 1.9 0 113 1.5c-.7.5-1.2.8-1.2 1.6M8 11.3v.4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </>
  )
};

export function glyphLabel(kind: GlyphKind): string {
  return LABELS[kind];
}

/**
 * A status shape. With a label it is an image that says the status; with an empty label it is decoration beside
 * words that already say it, and is hidden from assistive technology rather than announced as an unnamed image.
 */
export function StatusGlyph({ kind, label }: { kind: GlyphKind; label?: string }): ReactNode {
  const name = label ?? LABELS[kind];
  if (name === '') {
    return (
      <Svg $kind={kind} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        {SHAPES[kind]}
      </Svg>
    );
  }
  return (
    <Svg $kind={kind} viewBox="0 0 16 16" role="img" aria-label={name}>
      <title>{name}</title>
      {SHAPES[kind]}
    </Svg>
  );
}
