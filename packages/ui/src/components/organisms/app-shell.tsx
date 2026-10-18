import { useState, type ReactNode } from 'react';
import styled from 'styled-components';
import { applyColorScheme, readColorScheme, type ColorScheme } from '../../theme/color-scheme';
import { paths } from '../../routes/paths';
import { Button } from '../atoms/button';
import { Grow } from '../atoms/spacer';

const Frame = styled.div`
  display: grid;
  grid-template-rows: 3.25rem 1fr;
  height: 100vh;
`;

const Top = styled.header`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space.sm};
  padding: 0 ${({ theme }) => theme.space.lg};
  background: var(--surface);
  border-bottom: 1px solid var(--border);
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
`;

export interface Crumb {
  label: string;
  href?: string;
}

export function AppShell({ crumbs, children }: { crumbs: Crumb[]; children: ReactNode }): ReactNode {
  const [scheme, setScheme] = useState<ColorScheme>(() => document.documentElement.dataset.theme === 'dark' ? 'dark' : readColorScheme());

  const toggle = (): void => {
    const next = scheme === 'dark' ? 'light' : 'dark';
    applyColorScheme(next);
    setScheme(next);
  };

  return (
    <Frame>
      <Top>
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
        <Button type="button" $quiet onClick={toggle} aria-label={`Switch to ${scheme === 'dark' ? 'light' : 'dark'} theme`}>
          {scheme === 'dark' ? 'Light' : 'Dark'}
        </Button>
      </Top>
      <Body>{children}</Body>
    </Frame>
  );
}
