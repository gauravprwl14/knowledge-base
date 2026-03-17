'use client';

/**
 * QueryProvider — wraps the app with TanStack Query v5 QueryClientProvider.
 *
 * Default QueryClient options:
 * - staleTime: 30 s — data considered fresh for 30 seconds after a fetch
 * - retry: 2 — retries failed requests twice before surfacing an error
 * - gcTime: 5 min — inactive queries remain in cache for 5 minutes
 *
 * ReactQueryDevtools are included only in development mode.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { useState } from 'react';

// Default query client options — defined outside to avoid re-creating on render
const STALE_TIME = 30 * 1_000;        // 30 seconds
const GC_TIME = 5 * 60 * 1_000;       // 5 minutes
const RETRY_COUNT = 2;

function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: STALE_TIME,
        gcTime: GC_TIME,
        retry: RETRY_COUNT,
        refetchOnWindowFocus: false,
      },
      mutations: {
        retry: 0,
      },
    },
  });
}

/**
 * QueryProvider — place this at the root of the component tree (inside the
 * locale layout) so all child components can use `useQuery` / `useMutation`.
 */
export function QueryProvider({ children }: { children: React.ReactNode }) {
  // useState ensures each browser tab / server render gets its own client
  const [queryClient] = useState(() => makeQueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {process.env.NODE_ENV === 'development' && (
        <ReactQueryDevtools initialIsOpen={false} />
      )}
    </QueryClientProvider>
  );
}
