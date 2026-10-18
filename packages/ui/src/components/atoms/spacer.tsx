import styled from 'styled-components';
import type { AppTheme } from '../../theme/theme';

export const Spacer = styled.div<{ $size?: keyof AppTheme['space'] }>`
  flex: none;
  width: ${({ theme, $size = 'md' }) => theme.space[$size]};
  height: ${({ theme, $size = 'md' }) => theme.space[$size]};
`;

export const Grow = styled.div`
  flex: 1;
`;
