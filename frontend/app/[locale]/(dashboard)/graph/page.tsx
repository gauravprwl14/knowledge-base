'use client';

/**
 * GraphPage — client component shell for the knowledge graph route.
 *
 * Must be 'use client' because next/dynamic with ssr:false is only allowed
 * inside Client Components. ReactFlow depends on browser APIs (ResizeObserver,
 * pointer events) that are unavailable during SSR.
 */

import dynamic from 'next/dynamic';

/**
 * GraphExplorer is loaded client-side only because ReactFlow depends on
 * browser APIs (ResizeObserver, SVG pointer events). The `ssr: false` flag
 * prevents Next.js from attempting a server render and producing hydration
 * mismatches.
 */
const GraphExplorer = dynamic(
  () =>
    import('@/components/features/graph/GraphExplorer').then(
      (m) => m.GraphExplorer,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="p-6 text-slate-400" aria-busy="true">
        Loading graph…
      </div>
    ),
  },
);

/**
 * Default export — the Next.js page component for `/graph`.
 */
export default function GraphPage() {
  return <GraphExplorer />;
}
