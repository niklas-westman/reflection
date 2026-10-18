import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, type AnyRouter } from '@tanstack/react-router';
import { useState, type ReactNode } from 'react';
import { ThemeProvider } from 'styled-components';
import { BundleCatalogProvider, type BundleCatalog } from './data/bundle-catalog';
import { GlobalStyle } from './theme/global-style';
import { theme } from './theme/theme';

export interface AppProps {
  catalog: BundleCatalog;
  router: AnyRouter;
}

export function App({ catalog, router }: AppProps): ReactNode {
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }));

  return (
    <ThemeProvider theme={theme}>
      <GlobalStyle />
      <QueryClientProvider client={queryClient}>
        <BundleCatalogProvider catalog={catalog}>
          <RouterProvider router={router} />
        </BundleCatalogProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
