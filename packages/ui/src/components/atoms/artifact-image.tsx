import type { ReactNode } from 'react';
import styled from 'styled-components';
import { useBundleView } from '../../data/bundle-context';
import { useArtifactUrl } from '../../data/bundle-queries';
import { useInView } from './use-in-view';

// The frame has a fixed aspect so cards do not jump while images load. Images are contained, never stretched.
const Frame = styled.div<{ $aspect: string }>`
  display: grid;
  place-items: center;
  overflow: hidden;
  width: 100%;
  aspect-ratio: ${({ $aspect }) => $aspect};
  border: 1px solid var(--border);
  border-radius: ${({ theme }) => theme.radius.md};
  background: var(--thumb-light);
  color: var(--muted);
  font-size: ${({ theme }) => theme.font.sm};
  text-align: center;

  img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
  }
`;

export interface ArtifactImageProps {
  // Absent when nothing was recorded for this slot.
  path: string | undefined;
  alt: string;
  aspect?: string;
  emptyText?: string;
}

/** A verified image filling its container. A file that is missing, tampered with or absent says so instead of showing anything. */
export function ArtifactImage({ path, alt, aspect = '16 / 10', emptyText = 'No image recorded' }: ArtifactImageProps): ReactNode {
  const { bundleId, manifest, unusablePaths } = useBundleView();
  const [ref, inView] = useInView<HTMLDivElement>();
  const knownUnusable = path !== undefined && unusablePaths.has(path);
  const artifact = useArtifactUrl(bundleId, manifest, path ?? '', inView && path !== undefined && !knownUnusable);

  if (path === undefined) {
    return (
      <Frame ref={ref} $aspect={aspect} role="img" aria-label={`${alt}: ${emptyText.toLowerCase()}`}>
        {emptyText}
      </Frame>
    );
  }
  if (knownUnusable || artifact.data?.status === 'unusable') {
    return (
      <Frame ref={ref} $aspect={aspect} role="img" aria-label={`${alt}: file unusable`} title="This file is missing or does not match the bundle">
        File unusable
      </Frame>
    );
  }
  return <Frame ref={ref} $aspect={aspect}>{artifact.data?.status === 'ready' ? <img src={artifact.data.url} alt={alt} /> : null}</Frame>;
}
