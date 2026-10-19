import { useRouterState } from '@tanstack/react-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import styled from 'styled-components';
import { applyColorScheme, readColorScheme, type ColorScheme } from '../../theme/color-scheme';
import { paths } from '../../routes/paths';
import { Button } from '../atoms/button';
import { Grow } from '../atoms/spacer';

// Below this width the top bar wraps and the navigation sits above the content instead of beside it.
export const NARROW_QUERY = '(max-width: 760px)';

const Frame = styled.div`
  display: grid;
  grid-template-rows: 3.25rem 1fr;
  height: 100vh;

  @media ${NARROW_QUERY} {
    grid-template-rows: auto 1fr;
  }
`;

const Top = styled.header`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space.sm};
  padding: 0 ${({ theme }) => theme.space.lg};
  background: var(--surface);
  border-bottom: 1px solid var(--border);

  @media ${NARROW_QUERY} {
    flex-wrap: wrap;
    padding: ${({ theme }) => theme.space.xs} ${({ theme }) => theme.space.md};
    row-gap: ${({ theme }) => theme.space.xs};
  }
`;

const Brand = styled.a`
  font-weight: 650;
  letter-spacing: -0.01em;
  color: var(--text);
  text-decoration: none;
  margin-right: ${({ theme }) => theme.space.md};
`;

const Crumbs = styled.nav`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space.xs};
  color: var(--muted);
  min-width: 0;
  flex-wrap: wrap;

  a {
    color: var(--text);
    text-decoration: none;
    padding: 0.25rem ${({ theme }) => theme.space.xs};
    border-radius: ${({ theme }) => theme.radius.sm};
  }
  a:hover {
    background: var(--surface-2);
  }
`;

const Body = styled.div`
  min-height: 0;
  min-width: 0;
  display: flex;

  @media ${NARROW_QUERY} {
    flex-direction: column;
  }
`;

export interface Crumb {
  label: string;
  href?: string;
}

export interface AppShellProps {
  crumbs: Crumb[];
  // Always visible on the right of the top bar, for facts that must show on every route (the evidence state).
  status?: ReactNode;
  // A button that shows or hides the navigation beside the content, when the page has one.
  navigation?: { open: boolean; controls: string; onToggle: () => void };
  children: ReactNode;
}

export function AppShell({ crumbs, status, navigation, children }: AppShellProps): ReactNode {
  const [scheme, setScheme] = useState<ColorScheme>(() => document.documentElement.dataset.theme === 'dark' ? 'dark' : readColorScheme());

  // The page is titled by where the reader is, newest crumb first, so a tab, a history entry and a screen reader
  // all say which page this is.
  const title = [...crumbs.map((crumb) => crumb.label)].reverse().join(' · ');
  useEffect(() => {
    document.title = title ? `${title} · Reflection` : 'Reflection';
  }, [title]);

  // After a move to another page, focus goes to the page content so a keyboard or screen-reader user starts
  // there instead of at the point they left. Changing a filter or a mode on the same page does not move focus.
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const previousPath = useRef(pathname);
  useEffect(() => {
    if (previousPath.current === pathname) return;
    previousPath.current = pathname;
    const main = document.querySelector('main');
    main?.setAttribute('tabindex', '-1');
    main?.focus({ preventScroll: true });
  }, [pathname]);

  const toggle = (): void => {
    const next = scheme === 'dark' ? 'light' : 'dark';
    applyColorScheme(next);
    setScheme(next);
  };

  return (
    <Frame>
      <Top>
        {navigation ? (
          <Button type="button" $quiet aria-expanded={navigation.open} aria-controls={navigation.controls} onClick={navigation.onToggle}>
            {navigation.open ? 'Hide navigation' : 'Navigation'}
          </Button>
        ) : null}
        <Brand href={paths.bundles()}>Reflection</Brand>
        <Crumbs aria-label="Breadcrumb">
          {crumbs.map((crumb, index) => (
            <span key={`${crumb.label}-${index}`}>
              {index > 0 ? <span aria-hidden="true"> / </span> : null}
              {crumb.href ? <a href={crumb.href}>{crumb.label}</a> : <span>{crumb.label}</span>}
            </span>
          ))}
        </Crumbs>
        <Grow />
        {status}
        <Button type="button" $quiet onClick={toggle}>
          Switch to {scheme === 'dark' ? 'light' : 'dark'}
        </Button>
      </Top>
      <Body>{children}</Body>
    </Frame>
  );
}
