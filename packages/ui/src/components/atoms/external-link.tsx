import type { ReactNode } from 'react';

/** A link to somewhere outside the bundle, supplied by the provider. It opens in a new tab and sends no referrer. */
export function ExternalLink({ href, children }: { href: string; children: ReactNode }): ReactNode {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children} <span aria-hidden="true">↗</span>
    </a>
  );
}
