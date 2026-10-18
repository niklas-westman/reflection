import styled from 'styled-components';

export const Button = styled.button<{ $quiet?: boolean }>`
  border: 1px solid ${({ $quiet }) => ($quiet ? 'transparent' : 'var(--border-strong)')};
  background: ${({ $quiet }) => ($quiet ? 'none' : 'var(--surface)')};
  border-radius: ${({ theme }) => theme.radius.md};
  padding: 0.375rem ${({ theme }) => theme.space.sm};

  &:hover:not(:disabled) {
    background: var(--surface-2);
  }
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;
