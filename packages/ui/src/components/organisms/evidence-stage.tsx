import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import styled from 'styled-components';
import type { Artifact } from 'reflection-projection';
import { useBundleView } from '../../data/bundle-context';
import { useArtifactUrl } from '../../data/bundle-queries';
import type { InspectorMode, Zoom } from '../../model/inspector-state';

export interface Size {
  width: number;
  height: number;
}

const Checker = `
  background-image: linear-gradient(45deg, #0000000d 25%, transparent 25%), linear-gradient(-45deg, #0000000d 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #0000000d 75%), linear-gradient(-45deg, transparent 75%, #0000000d 75%);
  background-size: 16px 16px;
  background-position: 0 0, 0 8px, 8px -8px, -8px 0;
`;

// At Fit, a surface takes the image's own shape at the full width it is given, never taller than the window
// leaves room for, so there is no empty box around the evidence. At a zoom it is a fixed window that scrolls.
const Surface = styled.div<{ $checker: boolean; $tall: boolean; $aspect?: string | undefined }>`
  display: grid;
  grid-template: 100% / 100%;
  overflow: auto;
  ${({ $aspect, $tall }) =>
    $aspect
      ? `aspect-ratio: ${$aspect}; max-height: calc(100vh - ${$tall ? '13rem' : '15rem'}); min-height: 8rem;`
      : `height: ${$tall ? '34rem' : '28rem'};`}
  border: 1px solid var(--border);
  border-radius: ${({ theme }) => theme.radius.md};
  background-color: var(--thumb-light);
  ${({ $checker }) => ($checker ? Checker : '')}

  img {
    display: block;
    grid-area: 1 / 1;
  }
  img.fit {
    max-width: 100%;
    max-height: 100%;
    margin: auto;
    object-fit: contain;
  }
  img.native {
    max-width: none;
    align-self: start;
    justify-self: start;
  }
`;

const Empty = styled.div`
  display: grid;
  place-items: center;
  align-content: center;
  gap: ${({ theme }) => theme.space.xs};
  padding: ${({ theme }) => theme.space.md};
  text-align: center;
  color: var(--muted);
  font-size: ${({ theme }) => theme.font.sm};
`;

const Panel = styled.figure`
  margin: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space.xs};

  figcaption {
    display: flex;
    justify-content: space-between;
    gap: ${({ theme }) => theme.space.xs};
    font-size: ${({ theme }) => theme.font.sm};
  }
  .meta {
    color: var(--muted);
    font-size: ${({ theme }) => theme.font.xs};
  }
`;

const ThreeUp = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: ${({ theme }) => theme.space.sm};
  align-items: start;

  @media (max-width: 760px) {
    grid-template-columns: minmax(0, 1fr);
  }
`;

// The recorded difference large on the left, the reference and the implementation stacked beside it.
const DifferenceLarge = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
  grid-template-areas: 'diff reference' 'diff actual';
  gap: ${({ theme }) => theme.space.sm};
  align-items: start;

  > .diff {
    grid-area: diff;
  }

  @media (max-width: 760px) {
    grid-template-columns: minmax(0, 1fr);
    grid-template-areas: 'diff' 'reference' 'actual';
  }
`;

export interface SyncedScroll {
  register: (id: string, element: HTMLElement | null) => void;
  onScroll: (id: string, element: HTMLElement) => void;
}

/** Keeps the scroll position of several surfaces in step, as a share of each one's own scrollable size. */
export function useSyncedScroll(): SyncedScroll {
  const elements = useRef(new Map<string, HTMLElement>());
  const busy = useRef(false);

  return {
    register: (id, element) => {
      if (element) elements.current.set(id, element);
      else elements.current.delete(id);
    },
    onScroll: (id, source) => {
      if (busy.current) return;
      busy.current = true;
      const left = source.scrollLeft / Math.max(1, source.scrollWidth - source.clientWidth);
      const top = source.scrollTop / Math.max(1, source.scrollHeight - source.clientHeight);
      for (const [otherId, other] of elements.current) {
        if (otherId === id) continue;
        other.scrollLeft = left * (other.scrollWidth - other.clientWidth);
        other.scrollTop = top * (other.scrollHeight - other.clientHeight);
      }
      requestAnimationFrame(() => {
        busy.current = false;
      });
    }
  };
}

type Slot = 'reference' | 'actual' | 'diff';

interface EvidenceImageProps {
  artifact: Artifact | undefined;
  alt: string;
  zoom: Zoom;
  emptyTitle: string;
  emptyDetail: string;
  onSize?: (size: Size) => void;
  opacity?: number;
  clipLeft?: number;
}

// A verified image at the chosen zoom. Fit scales it into the panel; a number is a share of its native size.
function useEvidenceImage({ artifact, onSize }: Pick<EvidenceImageProps, 'artifact' | 'onSize'>): { state: 'none' | 'loading' | 'unusable' | 'ready'; url: string | undefined; natural: Size | undefined; onLoad: (event: { currentTarget: HTMLImageElement }) => void } {
  const { bundleId, manifest, unusablePaths } = useBundleView();
  const [natural, setNatural] = useState<Size | undefined>(undefined);
  const path = artifact?.path;
  const knownUnusable = path !== undefined && unusablePaths.has(path);
  const query = useArtifactUrl(bundleId, manifest, path ?? '', path !== undefined && !knownUnusable);

  const onLoad = (event: { currentTarget: HTMLImageElement }): void => {
    const size = { width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight };
    setNatural(size);
    onSize?.(size);
  };

  if (path === undefined) return { state: 'none', url: undefined, natural, onLoad };
  if (knownUnusable || query.data?.status === 'unusable') return { state: 'unusable', url: undefined, natural, onLoad };
  return query.data?.status === 'ready' ? { state: 'ready', url: query.data.url, natural, onLoad } : { state: 'loading', url: undefined, natural, onLoad };
}

function EvidenceImage(props: EvidenceImageProps & { checker: boolean; tall: boolean; sync: SyncedScroll; syncId: string }): ReactNode {
  const { artifact, alt, zoom, emptyTitle, emptyDetail, checker, tall, sync, syncId } = props;
  const image = useEvidenceImage(props);
  const scale = zoom === 'fit' ? undefined : zoom / 100;
  const size = image.natural ?? (artifact?.width && artifact.height ? { width: artifact.width, height: artifact.height } : undefined);
  const aspect = scale === undefined && image.state === 'ready' && size ? `${size.width} / ${size.height}` : undefined;

  return (
    <Surface
      $checker={checker}
      $tall={tall}
      $aspect={aspect}
      ref={(element) => sync.register(syncId, element)}
      onScroll={(event) => sync.onScroll(syncId, event.currentTarget)}
      tabIndex={0}
      role="group"
      aria-label={alt}
    >
      {image.state === 'ready' && image.url ? (
        <img
          className={scale === undefined ? 'fit' : 'native'}
          src={image.url}
          alt={alt}
          onLoad={image.onLoad}
          style={{ ...(scale !== undefined && image.natural ? { width: image.natural.width * scale, height: image.natural.height * scale } : {}), ...(props.opacity !== undefined ? { opacity: props.opacity } : {}), ...(props.clipLeft !== undefined ? { clipPath: `inset(0 0 0 ${props.clipLeft}%)` } : {}) }}
        />
      ) : (
        <Empty>
          <strong>{image.state === 'unusable' ? 'File unusable' : image.state === 'loading' ? 'Loading' : emptyTitle}</strong>
          {image.state === 'unusable' ? <span>This file is missing or does not match the bundle, so it is not shown.</span> : image.state === 'none' ? <span>{emptyDetail}</span> : null}
        </Empty>
      )}
    </Surface>
  );
}

function DownloadLink({ artifact, label }: { artifact: Artifact | undefined; label: string }): ReactNode {
  const { bundleId, manifest, unusablePaths } = useBundleView();
  const usable = artifact !== undefined && !unusablePaths.has(artifact.path);
  const query = useArtifactUrl(bundleId, manifest, artifact?.path ?? '', usable);
  if (!artifact || query.data?.status !== 'ready') return null;
  return (
    <a href={query.data.url} download={artifact.path.split('/').at(-1)} aria-label={`Download original ${label}`}>
      Original
    </a>
  );
}

const DIMENSIONS_HINT = 'Shown at native size when the two images differ in size: nothing is scaled to hide it.';

export interface EvidenceStageProps {
  mode: InspectorMode;
  zoom: Zoom;
  checkerboard: boolean;
  reference: Artifact | undefined;
  actual: Artifact | undefined;
  diff: Artifact | undefined;
  diffMetricText: string | undefined;
  referenceMissingReason: string;
  implementationLabel: string;
  // Share of the implementation image shown over the reference, 0 to 100 (blinking switches it between 0 and 100).
  opacity: number;
  wipe: number;
  onSizes: (slot: Slot, size: Size) => void;
  sizes: Partial<Record<Slot, Size>>;
}

/**
 * The evidence itself. Side by side shows reference, actual and the recorded diff at once; the other modes use
 * one large stage. Zoom and scroll are shared, and a size mismatch forces native size (see `effectiveZoom`).
 */
export function EvidenceStage(props: EvidenceStageProps): ReactNode {
  const { mode, checkerboard, reference, actual, diff, sizes } = props;
  const sync = useSyncedScroll();
  const mismatch = findMismatch(reference, actual, sizes);
  const zoom: Zoom = mismatch && props.zoom === 'fit' ? 100 : props.zoom;
  const shared = { checker: checkerboard, sync, zoom };
  const labelFor = (artifact: Artifact | undefined, slot: Slot): string => {
    const size = sizes[slot] ?? (artifact?.width && artifact?.height ? { width: artifact.width, height: artifact.height } : undefined);
    return size ? `${size.width} × ${size.height}` : 'Size not recorded';
  };

  const referencePanel = (
    <Panel>
      <figcaption>
        <strong>Reference</strong>
        <DownloadLink artifact={reference} label="reference" />
      </figcaption>
      <EvidenceImage {...shared} syncId="reference" tall={false} artifact={reference} alt="Reference" emptyTitle="No reference image" emptyDetail={props.referenceMissingReason} onSize={(size) => props.onSizes('reference', size)} />
      <span className="meta">{labelFor(reference, 'reference')}</span>
    </Panel>
  );
  const actualPanel = (
    <Panel>
      <figcaption>
        <strong>{props.implementationLabel}</strong>
        <DownloadLink artifact={actual} label="implementation" />
      </figcaption>
      <EvidenceImage {...shared} syncId="actual" tall={false} artifact={actual} alt="Implementation" emptyTitle="No implementation image" emptyDetail="Nothing was captured for this comparison." onSize={(size) => props.onSizes('actual', size)} />
      <span className="meta">{labelFor(actual, 'actual')}</span>
    </Panel>
  );
  const diffPanel = (
    <Panel className="diff">
      <figcaption>
        <strong>Difference</strong>
        <DownloadLink artifact={diff} label="difference" />
      </figcaption>
      <EvidenceImage {...shared} syncId="diff" tall={false} artifact={diff} alt="Difference" emptyTitle="No diff recorded" emptyDetail={props.diffMetricText ?? 'This comparison recorded no difference image and no pixel metric.'} onSize={(size) => props.onSizes('diff', size)} />
      <span className="meta">{diff ? labelFor(diff, 'diff') : (props.diffMetricText ?? 'Not recorded')}</span>
    </Panel>
  );

  return (
    <div>
      {mismatch ? (
        <p role="status" style={{ color: 'var(--gap)', margin: '0 0 0.5rem' }}>
          ▲ The reference is {mismatch.reference.width} × {mismatch.reference.height} and the implementation is {mismatch.actual.width} × {mismatch.actual.height}. {DIMENSIONS_HINT}
        </p>
      ) : null}
      {mode === 'side-by-side' ? (
        <ThreeUp role="group" aria-label="Reference, implementation and difference">
          {referencePanel}
          {actualPanel}
          {diffPanel}
        </ThreeUp>
      ) : null}
      {mode === 'difference-large' ? (
        <DifferenceLarge role="group" aria-label="Difference, with the reference and implementation beside it">
          {diffPanel}
          {referencePanel}
          {actualPanel}
        </DifferenceLarge>
      ) : null}
      {mode === 'overlay' || mode === 'wipe' ? (
        <Panel>
          <figcaption>
            <strong>{mode === 'overlay' ? 'Reference under implementation' : 'Reference on the left, implementation on the right'}</strong>
            <span className="meta">{labelFor(reference, 'reference')} · {labelFor(actual, 'actual')}</span>
          </figcaption>
          <StackedStage {...props} zoom={zoom} sync={sync} checker={checkerboard} />
        </Panel>
      ) : null}
      {mode === 'diff' ? (
        <Panel>
          <figcaption>
            <strong>Recorded difference</strong>
            <DownloadLink artifact={diff} label="difference" />
          </figcaption>
          <EvidenceImage {...shared} syncId="diff" tall artifact={diff} alt="Difference" emptyTitle="No diff recorded" emptyDetail={props.diffMetricText ?? 'This comparison recorded no difference image and no pixel metric.'} onSize={(size) => props.onSizes('diff', size)} />
          {diff ? <span className="meta">{labelFor(diff, 'diff')}</span> : null}
        </Panel>
      ) : null}
    </div>
  );
}

// Reference and implementation in one scroll surface, aligned at the top left at the same scale.
function StackedStage(props: EvidenceStageProps & { sync: SyncedScroll; checker: boolean }): ReactNode {
  const { mode, reference, actual, zoom, checker, sync } = props;
  const referenceImage = useEvidenceImage({ artifact: reference, onSize: (size) => props.onSizes('reference', size) });
  const actualImage = useEvidenceImage({ artifact: actual, onSize: (size) => props.onSizes('actual', size) });
  const ref = useRef<HTMLDivElement | null>(null);
  const scaleOf = (natural: Size | undefined): Record<string, number> | undefined => (zoom === 'fit' || !natural ? undefined : { width: natural.width * (zoom / 100), height: natural.height * (zoom / 100) });

  if (referenceImage.state !== 'ready' || actualImage.state !== 'ready' || !referenceImage.url || !actualImage.url) {
    const reason = referenceImage.state === 'unusable' || actualImage.state === 'unusable' ? 'A file is unusable, so it is not shown.' : referenceImage.state === 'none' ? props.referenceMissingReason : actualImage.state === 'none' ? 'There is no implementation image to put over the reference.' : 'Loading';
    return (
      <Surface $checker={checker} $tall>
        <Empty>
          <strong>{mode === 'overlay' ? 'Overlay needs both images' : 'Wipe needs both images'}</strong>
          <span>{reason}</span>
        </Empty>
      </Surface>
    );
  }

  return (
    <Surface $checker={checker} $tall ref={(element) => { ref.current = element; sync.register('stack', element); }} tabIndex={0} role="group" aria-label={mode === 'overlay' ? 'Overlay of the reference and the implementation' : 'Wipe between the reference and the implementation'}>
      <img className={zoom === 'fit' ? 'fit' : 'native'} src={referenceImage.url} alt="Reference" onLoad={referenceImage.onLoad} style={scaleOf(referenceImage.natural)} />
      <img
        className={zoom === 'fit' ? 'fit' : 'native'}
        src={actualImage.url}
        alt="Implementation"
        onLoad={actualImage.onLoad}
        style={{
          ...scaleOf(actualImage.natural),
          ...(mode === 'overlay' ? { opacity: props.opacity / 100 } : { clipPath: `inset(0 0 0 ${props.wipe}%)` })
        }}
      />
    </Surface>
  );
}

function findMismatch(reference: Artifact | undefined, actual: Artifact | undefined, sizes: Partial<Record<Slot, Size>>): { reference: Size; actual: Size } | undefined {
  const sizeOf = (artifact: Artifact | undefined, slot: Slot): Size | undefined => sizes[slot] ?? (artifact?.width && artifact?.height ? { width: artifact.width, height: artifact.height } : undefined);
  const referenceSize = sizeOf(reference, 'reference');
  const actualSize = sizeOf(actual, 'actual');
  if (!referenceSize || !actualSize) return undefined;
  return referenceSize.width === actualSize.width && referenceSize.height === actualSize.height ? undefined : { reference: referenceSize, actual: actualSize };
}

/** Exposed for tests: whether the two images differ in size, from what is known. */
export const sizesMismatch = findMismatch;

export function useBlink(active: boolean, intervalMs = 700): boolean {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!active) {
      setShown(false);
      return;
    }
    const timer = setInterval(() => setShown((value) => !value), intervalMs);
    return () => clearInterval(timer);
  }, [active, intervalMs]);
  return shown;
}

export type { RefObject };
