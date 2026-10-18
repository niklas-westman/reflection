import type { ReactNode } from 'react';
import styled from 'styled-components';
import { StatusGlyph, type GlyphKind } from '../atoms/status-glyph';

export type BannerTone = 'fail' | 'gap' | 'idle';

const GLYPHS: Record<BannerTone, GlyphKind> = { fail: 'invalid', gap: 'gap', idle: 'unknown' };

const Box = styled.div<{ $tone: BannerTone }>`
  display: flex;
  align-items: flex-start;
  gap: ${({ theme }) => theme.space.sm};
  padding: ${({ theme }) => theme.space.xs} ${({ theme }) => theme.space.sm};
  border-radius: ${({ theme }) => theme.radius.md};
  font-size: ${({ theme }) => theme.font.sm};
  color: ${({ $tone }) => `var(--${$tone})`};
  background: ${({ $tone }) => `var(--${$tone}-bg)`};
  border: ${({ $tone }) => ($tone === 'idle' ? '1px solid var(--border)' : '1px solid transparent')};

  ul {
    margin: 0.25rem 0 0;
    padding-left: 1.1rem;
  }
`;

export function Banner({ tone, title, children }: { tone: BannerTone; title: string; children?: ReactNode }): ReactNode {
  return (
    <Box $tone={tone} role={tone === 'fail' ? 'alert' : 'status'}>
      <StatusGlyph kind={GLYPHS[tone]} label="" />
      <div>
        <strong>{title}</strong>
        {children}
      </div>
    </Box>
  );
}
