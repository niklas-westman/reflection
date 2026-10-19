import type { ReactNode } from 'react';
import styled from 'styled-components';
import type { ItemChange } from 'reflection-projection';
import type { ImageSource } from '../atoms/artifact-image';
import { ArtifactImage } from '../atoms/artifact-image';

const Pair = styled.div`
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: ${({ theme }) => theme.space.xs};

  figure {
    margin: 0;
    min-width: 0;
  }
  figcaption {
    color: var(--muted);
    font-size: ${({ theme }) => theme.font.xs};
    margin-bottom: 0.125rem;
  }
  .arrow {
    color: var(--muted);
  }
`;

export interface BeforeAfterProps {
  item: ItemChange;
  previousRelease: string;
  currentRelease: string;
  previousSource: ImageSource;
}

/**
 * The design reference of one item in the previous release and in this one. An item that did not exist, or that
 * no longer exists, says so in the empty side instead of showing a stand-in.
 */
export function BeforeAfter({ item, previousRelease, currentRelease, previousSource }: BeforeAfterProps): ReactNode {
  return (
    <Pair aria-label={`${item.label}: before and after`}>
      <figure>
        <figcaption>{previousRelease}</figcaption>
        <ArtifactImage
          from={previousSource}
          path={item.before?.path}
          alt={`${item.label}, in ${previousRelease}`}
          aspect="16 / 9"
          emptyText={item.change === 'added' ? 'Not in the previous release' : 'No reference recorded'}
          goneText="Image no longer retained"
        />
      </figure>
      <span className="arrow" aria-hidden="true">
        →
      </span>
      <figure>
        <figcaption>{currentRelease}</figcaption>
        <ArtifactImage path={item.after?.path} alt={`${item.label}, in ${currentRelease}`} aspect="16 / 9" emptyText={item.change === 'removed' ? 'Removed from the required items' : 'No reference recorded'} />
      </figure>
    </Pair>
  );
}
