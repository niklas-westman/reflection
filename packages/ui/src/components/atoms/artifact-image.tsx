import type { ReactNode } from 'react';
import type { BundleManifest } from 'reflection-projection';
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

/** Another bundle to read the image from, such as the previous release. */
export interface ImageSource {
  bundleId: string;
  manifest: BundleManifest;
  unusablePaths: ReadonlySet<string>;
}

export interface ArtifactImageProps {
  // Absent when nothing was recorded for this slot.
  path: string | undefined;
  alt: string;
  aspect?: string;
  emptyText?: string;
  from?: ImageSource;
  // What to say when the file is declared but gone, for example after a release was pruned.
  goneText?: string;
}

/** A verified image filling its container. A file that is missing, tampered with or absent says so instead of showing anything. */
export function ArtifactImage({ path, alt, aspect = '16 / 10', emptyText = 'No image recorded', from, goneText }: ArtifactImageProps): ReactNode {
  const current = useBundleView();
  const { bundleId, manifest, unusablePaths } = from ?? current;
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
    const gone = goneText !== undefined && artifact.data?.status === 'unusable' && artifact.data.code === 'file-missing';
    return (
      <Frame ref={ref} $aspect={aspect} role="img" aria-label={`${alt}: ${gone ? goneText.toLowerCase() : 'file unusable'}`} title="This file is missing or does not match the bundle">
        {gone ? goneText : 'File unusable'}
      </Frame>
    );
  }
  return <Frame ref={ref} $aspect={aspect}>{artifact.data?.status === 'ready' ? <img src={artifact.data.url} alt={alt} /> : null}</Frame>;
}
