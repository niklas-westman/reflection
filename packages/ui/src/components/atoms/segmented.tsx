import styled from 'styled-components';

/** A small row of mutually exclusive buttons. Pressed state is announced with aria-pressed. */
export const Segmented = styled.div`
  display: inline-flex;
  border: 1px solid var(--border-strong);
  border-radius: ${({ theme }) => theme.radius.md};
  overflow: hidden;

  button {
    border: 0;
    background: var(--surface);
    padding: 0.375rem ${({ theme }) => theme.space.md};
    font-size: ${({ theme }) => theme.font.sm};
  }
  button[aria-pressed='true'] {
    background: var(--accent-bg);
    color: var(--accent);
    font-weight: 600;
  }
  button:disabled {
    color: var(--muted);
    cursor: not-allowed;
  }
`;
