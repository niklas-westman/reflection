import type { ReactNode } from 'react';
import type { Validity } from 'reflection-projection';
import { Pill } from '../atoms/pill';
import { StatusGlyph } from '../atoms/status-glyph';

/** The evidence state. A bundle is never "Current": it has no live inputs, so a sound one reads as offline. */
export function ValidityPill({ validity, verifying = false }: { validity: Validity; verifying?: boolean }): ReactNode {
  if (verifying && validity.state === 'offline') {
    return <Pill $tone="idle">Verifying files…</Pill>;
  }
  switch (validity.state) {
    case 'invalid':
      return (
        <Pill $tone="fail">
          <StatusGlyph kind="invalid" label="" />
          Evidence invalid
        </Pill>
      );
    case 'stale':
      return (
        <Pill $tone="gap">
          <StatusGlyph kind="gap" label="" />
          Evidence stale
        </Pill>
      );
    case 'never-run':
      return <Pill $tone="idle">Never run</Pill>;
    case 'offline':
      return <Pill $tone="idle">Offline bundle · freshness not verified</Pill>;
    case 'current':
      return (
        <Pill $tone="pass">
          <StatusGlyph kind="passed" label="" />
          Evidence current
        </Pill>
      );
  }
}
