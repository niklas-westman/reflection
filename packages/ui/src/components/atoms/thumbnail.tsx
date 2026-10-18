import type { ReactNode } from 'react';
import styled from 'styled-components';
import { useBundleView } from '../../data/bundle-context';
import { useArtifactUrl } from '../../data/bundle-queries';
import { useInView } from './use-in-view';

// The frame is a fixed size so rows do not jump while images load. Images are contained, never stretched.
const Frame = styled.span<{ $height: number }>`
  flex: none;
  display: grid;
  place-items: center;
  overflow: hidden;
  width: ${({ $height }) => $height * 2}px;
  height: ${({ $height }) => $height}px;
  border: 1px solid var(--border);
  border-radius: ${({ theme }) => theme.radius.sm};
  background: var(--thumb-light);
  color: var(--muted);
  font-size: ${({ theme }) => theme.font.xs};

  img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
  }
`;

export interface ThumbnailProps {
  path: string;
  alt: string;
  height?: number;
}

/** A verified image. A file that is missing, tampered with or undeclared shows why, never the image. */
export function Thumbnail({ path, alt, height = 36 }: ThumbnailProps): ReactNode {
  const { bundleId, manifest, unusablePaths } = useBundleView();
  const [ref, inView] = useInView<HTMLSpanElement>();
  const knownUnusable = unusablePaths.has(path);
  const artifact = useArtifactUrl(bundleId, manifest, path, inView && !knownUnusable);

  if (knownUnusable || artifact.data?.status === 'unusable') {
    return (
      <Frame ref={ref} $height={height} role="img" aria-label={`${alt}: file unusable`} title="This file is missing or does not match the bundle">
        n/a
      </Frame>
    );
  }
  return (
    <Frame ref={ref} $height={height}>
      {artifact.data?.status === 'ready' ? <img src={artifact.data.url} alt={alt} /> : null}
    </Frame>
  );
}
