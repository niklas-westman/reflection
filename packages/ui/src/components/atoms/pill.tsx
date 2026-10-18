import styled from 'styled-components';

export type PillTone = 'pass' | 'fail' | 'gap' | 'idle';

const TONES: Record<PillTone, { color: string; background: string }> = {
  pass: { color: 'var(--pass)', background: 'var(--pass-bg)' },
  fail: { color: 'var(--fail)', background: 'var(--fail-bg)' },
  gap: { color: 'var(--gap)', background: 'var(--gap-bg)' },
  idle: { color: 'var(--idle)', background: 'var(--idle-bg)' }
};

export const Pill = styled.span<{ $tone: PillTone }>`
  display: inline-flex;
  align-items: center;
  gap: ${({ theme }) => theme.space.xs};
  padding: 0.125rem ${({ theme }) => theme.space.sm};
  border-radius: ${({ theme }) => theme.radius.pill};
  border: 1px solid ${({ $tone }) => ($tone === 'idle' ? 'var(--border)' : 'transparent')};
  font-size: ${({ theme }) => theme.font.xs};
  font-weight: 550;
  white-space: nowrap;
  color: ${({ $tone }) => TONES[$tone].color};
  background: ${({ $tone }) => TONES[$tone].background};
`;
