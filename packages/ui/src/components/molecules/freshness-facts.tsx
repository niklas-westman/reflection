import type { ReactNode } from 'react';
import styled from 'styled-components';
import type { FreshnessLine } from '../../model/freshness';

const Group = styled.section`
  margin: ${({ theme }) => theme.space.sm} 0 0;

  h2 {
    margin: 0 0 0.25rem;
    color: var(--muted);
    font-size: ${({ theme }) => theme.font.xs};
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  dl {
    display: grid;
    grid-template-columns: max-content minmax(0, 1fr);
    gap: 0.125rem ${({ theme }) => theme.space.sm};
    margin: 0;
    font-size: ${({ theme }) => theme.font.sm};
  }
  dt {
    color: var(--muted);
  }
  dd {
    margin: 0;
    overflow-wrap: anywhere;
  }
  .caution {
    color: var(--gap);
    font-weight: 600;
  }
`;

/** Whether the proof is still about the current design and code, as the same few lines on every screen. */
export function FreshnessFacts({ lines }: { lines: FreshnessLine[] }): ReactNode {
  return (
    <Group aria-label="Freshness">
      <h2>Freshness</h2>
      <dl>
        {lines.map((line, index) => (
          <div key={`${line.label}-${index}`} style={{ display: 'contents' }}>
            <dt className={line.caution ? 'caution' : undefined}>{line.label}</dt>
            <dd className={line.caution ? 'caution' : undefined}>{line.value}</dd>
          </div>
        ))}
      </dl>
    </Group>
  );
}
