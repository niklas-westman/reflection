import styled from 'styled-components';

/**
 * A small row of mutually exclusive buttons. Pressed state is announced with aria-pressed. Labels never wrap;
 * on a narrow screen the row scrolls sideways inside itself.
 */
export const Segmented = styled.div`
  display: inline-flex;
  max-width: 100%;
  border: 1px solid var(--border-strong);
  border-radius: ${({ theme }) => theme.radius.md};
  overflow-x: auto;

  button {
    flex: none;
    white-space: nowrap;
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
