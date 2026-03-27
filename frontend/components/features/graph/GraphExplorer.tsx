'use client';

/**
 * GraphExplorer.tsx — Interactive knowledge graph visualisation.
 *
 * Uses @xyflow/react (ReactFlow v12) to render a force-directed graph of named
 * entities extracted from the knowledge base.
 *
 * Key interactions:
 *  - Initial load fetches the top-50 entities and lays them out in a circle.
 *  - Type filter dropdown narrows visible nodes by NER category.
 *  - Clicking a node fetches its neighbourhood and merges neighbours into the graph.
 *  - "Clear selection" resets back to the initial flat entity list.
 *
 * ReactFlow is loaded via `next/dynamic` with ssr:false because it depends on
 * browser-only APIs (ResizeObserver, SVG, pointer events). The import is done
 * at module level so the dynamic wrapper can be used inside JSX without hooks.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import {
  type Node,
  type Edge,
  type NodeTypes,
  Background,
  Controls,
  MarkerType,
  useEdgesState,
  useNodesState,
} from '@xyflow/react';

// Import the ReactFlow CSS — required for edges, handles, and selection rings
import '@xyflow/react/dist/style.css';

import {
  getGraphEntities,
  getEntityRelated,
  type GraphEntity,
  type GraphRelated,
} from '@/lib/api/graph';

// ---------------------------------------------------------------------------
// Lazy-loaded ReactFlow component (SSR-safe)
// ---------------------------------------------------------------------------

/**
 * ReactFlow itself is dynamically imported with ssr:false so Next.js never
 * attempts to render it on the server (it depends on DOM APIs).
 */
const ReactFlow = dynamic(
  () => import('@xyflow/react').then((m) => m.ReactFlow),
  { ssr: false },
);

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maps NER type tags to brand colours used for node fills. */
const NODE_COLORS: Record<string, string> = {
  PERSON: '#4ade80',
  ORG: '#fb923c',
  GPE: '#c084fc',
  EVENT: '#38bdf8',
  FILE: '#93c5fd',
};

/** Fallback colour for types not in NODE_COLORS */
const DEFAULT_NODE_COLOR = '#94a3b8';

/** Entity types shown in the filter dropdown */
const ENTITY_TYPES = ['ALL', 'PERSON', 'ORG', 'GPE', 'EVENT'] as const;
type EntityTypeFilter = (typeof ENTITY_TYPES)[number];

/** Base node size (width = height). Scaled up by degree. */
const BASE_NODE_SIZE = 40;

/** Scaling factor applied per degree unit (capped to prevent gigantic nodes). */
const DEGREE_SCALE = 3;

/** Maximum additional px added by degree scaling */
const MAX_DEGREE_BONUS = 60;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns the fill colour for a given NER type.
 *
 * @param type - NER type string (e.g. 'PERSON', 'ORG').
 * @returns    A hex colour string.
 */
function colorForType(type: string): string {
  return NODE_COLORS[type] ?? DEFAULT_NODE_COLOR;
}

/**
 * Computes the pixel size of a node based on its degree.
 *
 * Degree is clamped so the visual difference between a highly-connected node
 * and an average node is noticeable but not overwhelming.
 *
 * @param degree - Number of edges (co-occurrences) the entity has.
 * @returns      Pixel width/height for a square node.
 */
function sizeForDegree(degree: number): number {
  const bonus = Math.min(degree * DEGREE_SCALE, MAX_DEGREE_BONUS);
  return BASE_NODE_SIZE + bonus;
}

/**
 * Arranges nodes evenly around a circle.
 *
 * This gives a reasonable starting layout with no overlap for small graphs.
 * ReactFlow's drag-and-drop lets users rearrange nodes afterward.
 *
 * @param nodes  - ReactFlow Node array (positions may be unset).
 * @param radius - Circle radius in pixels. Defaults to 300.
 * @returns      A new array with `position` set on every node.
 */
function circleLayout(nodes: Node[], radius = 300): Node[] {
  return nodes.map((node, i) => ({
    ...node,
    position: {
      x: radius * Math.cos((2 * Math.PI * i) / nodes.length),
      y: radius * Math.sin((2 * Math.PI * i) / nodes.length),
    },
  }));
}

/**
 * Converts a `GraphEntity` into a ReactFlow `Node`.
 *
 * The node `data.label` is set to the entity name so the default ReactFlow
 * renderer shows a readable label. Custom style overrides the default white
 * background with the entity-type colour.
 *
 * @param entity - Entity from the graph API.
 * @returns      A ReactFlow Node (position is {0,0} — set by circleLayout).
 */
function entityToNode(entity: GraphEntity): Node {
  const size = sizeForDegree(entity.degree);
  const color = colorForType(entity.type);

  return {
    id: entity.id,
    // Store full entity data so click handlers can read it without extra lookups
    data: { label: entity.name, entity },
    position: { x: 0, y: 0 }, // overwritten by circleLayout
    style: {
      background: color,
      border: `2px solid ${color}`,
      borderRadius: '50%',
      width: size,
      height: size,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: size < 50 ? 9 : 11,
      fontWeight: 600,
      color: '#0f172a', // dark text for contrast on coloured backgrounds
      cursor: 'pointer',
      // Overflow hidden keeps long names from breaking the circle shape
      overflow: 'hidden',
      padding: 4,
      textAlign: 'center',
      lineHeight: 1.1,
      whiteSpace: 'nowrap',
      textOverflow: 'ellipsis',
      boxSizing: 'border-box',
    },
  };
}

/**
 * Converts a co-occurrence relationship into a ReactFlow `Edge`.
 *
 * Edges are rendered as animated bezier curves with an arrowhead to convey
 * directionality (focal entity → co-occurring entity).
 *
 * @param sourceId - ID of the focal entity.
 * @param targetId - ID of the co-occurring entity.
 * @returns        A ReactFlow Edge.
 */
function makeEdge(sourceId: string, targetId: string): Edge {
  return {
    id: `${sourceId}--${targetId}`,
    source: sourceId,
    target: targetId,
    animated: false,
    style: { stroke: '#475569', strokeWidth: 1.5 },
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color: '#475569',
    },
  };
}

// ---------------------------------------------------------------------------
// GraphExplorer component
// ---------------------------------------------------------------------------

/**
 * GraphExplorer — the main knowledge graph visualisation feature component.
 *
 * Manages all graph state: nodes, edges, loading flags, error messages, and
 * the currently selected entity. Renders the ReactFlow canvas with a filter
 * toolbar above it.
 */
export function GraphExplorer() {
  // ---- Graph state ---------------------------------------------------------

  /** Nodes currently displayed in the ReactFlow canvas */
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  /** Edges currently displayed in the ReactFlow canvas */
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  // ---- UI state ------------------------------------------------------------

  /** True while the initial entity list is being fetched */
  const [loading, setLoading] = useState(true);
  /** True while a node-click neighbourhood fetch is in progress */
  const [expanding, setExpanding] = useState(false);
  /** Non-null when any fetch fails — message is shown to the user */
  const [error, setError] = useState<string | null>(null);
  /** Currently selected NER type filter */
  const [typeFilter, setTypeFilter] = useState<EntityTypeFilter>('ALL');
  /** ID of the entity whose neighbourhood is currently expanded (null = root view) */
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  /** Raw entity list from the initial load — kept so we can reset without re-fetching */
  const [allEntities, setAllEntities] = useState<GraphEntity[]>([]);

  // ---- Initial load --------------------------------------------------------

  /**
   * On mount, fetch the top-50 entities and render them in a circle.
   * No type filter is applied at this stage — filtering is client-side.
   */
  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setError(null);

    getGraphEntities(undefined, 50)
      .then((res) => {
        if (cancelled) return;

        setAllEntities(res.entities);

        // Convert entities → nodes → apply circle layout
        const rawNodes = res.entities.map(entityToNode);
        const laidOut = circleLayout(rawNodes);

        setNodes(laidOut);
        setEdges([]); // no edges in the flat entity list view
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const msg =
          (err as any)?.response?.data?.message ??
          (err as Error)?.message ??
          'Failed to load graph data';
        setError(msg);
        console.error('[GraphExplorer] initial load', err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      // Prevent state updates after unmount
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally runs once on mount

  // ---- Type filter (client-side) ------------------------------------------

  /**
   * When the user changes the type filter, re-derive the visible nodes from
   * the cached `allEntities` list. No network request — instant.
   */
  useEffect(() => {
    if (loading) return; // don't overwrite initial-load state

    // If a specific entity is expanded, don't wipe the neighbourhood view
    if (selectedEntityId) return;

    const filtered =
      typeFilter === 'ALL'
        ? allEntities
        : allEntities.filter((e) => e.type === typeFilter);

    const rawNodes = filtered.map(entityToNode);
    const laidOut = circleLayout(rawNodes);
    setNodes(laidOut);
    setEdges([]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeFilter]); // only re-run when the filter changes

  // ---- Node click — expand neighbourhood -----------------------------------

  /**
   * Handles a node click event from ReactFlow.
   *
   * Fetches the entity's neighbourhood and merges new nodes/edges into the
   * graph without removing the existing ones. Nodes that already exist are
   * not duplicated (deduplication by ID).
   */
  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      // Retrieve the entity embedded in node.data (set by entityToNode)
      const entity = (node.data as { entity: GraphEntity }).entity;
      if (!entity) return;

      setSelectedEntityId(entity.id);
      setExpanding(true);

      getEntityRelated(entity.id)
        .then((related: GraphRelated) => {
          // Build new nodes from co-occurring entities, skipping those already
          // present in the graph (prevents duplicate key warnings)
          setNodes((prev) => {
            const existingIds = new Set(prev.map((n) => n.id));

            const newNodes = related.coOccurring
              .filter((e) => !existingIds.has(e.id))
              .map(entityToNode);

            if (newNodes.length === 0) return prev; // nothing to add

            // Place new nodes in a smaller circle offset from the focal node
            // so the neighbourhood is visually grouped together
            const focalNode = prev.find((n) => n.id === entity.id);
            const cx = focalNode?.position.x ?? 0;
            const cy = focalNode?.position.y ?? 0;
            const radius = 180;

            const positioned = newNodes.map((n, i) => ({
              ...n,
              position: {
                x: cx + radius * Math.cos((2 * Math.PI * i) / newNodes.length),
                y: cy + radius * Math.sin((2 * Math.PI * i) / newNodes.length),
              },
            }));

            return [...prev, ...positioned];
          });

          // Add edges from the focal entity to each co-occurring entity
          setEdges((prev) => {
            const existingIds = new Set(prev.map((e) => e.id));
            const newEdges = related.coOccurring
              .map((co) => makeEdge(entity.id, co.id))
              .filter((e) => !existingIds.has(e.id));
            return [...prev, ...newEdges];
          });
        })
        .catch((err: unknown) => {
          const msg =
            (err as any)?.response?.data?.message ??
            (err as Error)?.message ??
            'Failed to load entity neighbourhood';
          setError(msg);
          console.error('[GraphExplorer] onNodeClick', err);
        })
        .finally(() => setExpanding(false));
    },
    // setNodes/setEdges are stable refs from useNodesState/useEdgesState
    [setNodes, setEdges],
  );

  // ---- Clear selection -----------------------------------------------------

  /**
   * Resets the graph to the initial flat entity view.
   * Respects the current type filter so the user doesn't lose their filter
   * after clearing a node selection.
   */
  const handleClearSelection = useCallback(() => {
    setSelectedEntityId(null);
    setError(null);

    const filtered =
      typeFilter === 'ALL'
        ? allEntities
        : allEntities.filter((e) => e.type === typeFilter);

    const laidOut = circleLayout(filtered.map(entityToNode));
    setNodes(laidOut);
    setEdges([]);
  }, [allEntities, typeFilter, setNodes, setEdges]);

  // ---- Derived state -------------------------------------------------------

  /** True when the graph has no nodes after the initial load finishes */
  const isEmpty = !loading && nodes.length === 0 && !error;

  // ---- Render --------------------------------------------------------------

  return (
    <div className="flex flex-col h-full min-h-[80vh]" data-testid="graph-explorer">
      {/* ------------------------------------------------------------------ */}
      {/* Toolbar                                                              */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-800 bg-slate-900/80 backdrop-blur-sm">
        <h1 className="text-base font-semibold text-slate-100">Knowledge Graph</h1>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Type filter dropdown */}
        <label htmlFor="graph-type-filter" className="text-xs text-slate-400 sr-only">
          Filter by entity type
        </label>
        <select
          id="graph-type-filter"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as EntityTypeFilter)}
          className="text-xs rounded-md px-2 py-1 bg-slate-800 border border-slate-700 text-slate-200 focus:outline-none focus:ring-1 focus:ring-slate-500"
          aria-label="Filter entities by type"
          disabled={loading}
        >
          {ENTITY_TYPES.map((t) => (
            <option key={t} value={t}>
              {t === 'ALL' ? 'All types' : t}
            </option>
          ))}
        </select>

        {/* Clear selection — only visible when a node is expanded */}
        {selectedEntityId && (
          <button
            onClick={handleClearSelection}
            className="text-xs px-3 py-1 rounded-md bg-slate-700 hover:bg-slate-600 text-slate-200 transition-colors"
            aria-label="Clear selected entity and reset graph"
          >
            Clear selection
          </button>
        )}

        {/* Expanding indicator */}
        {expanding && (
          <span className="text-xs text-slate-400 animate-pulse" aria-live="polite">
            Loading neighbourhood…
          </span>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Canvas area                                                          */}
      {/* ------------------------------------------------------------------ */}
      <div className="relative flex-1">
        {/* Loading skeleton — shown while the initial fetch is in progress */}
        {loading && (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#0f172a]"
            aria-busy="true"
            role="status"
          >
            <div className="flex gap-2">
              {[40, 60, 50, 70, 45].map((size, i) => (
                <div
                  key={i}
                  className="rounded-full bg-slate-700 animate-pulse"
                  style={{ width: size, height: size }}
                />
              ))}
            </div>
            <span className="text-sm text-slate-400">Loading graph…</span>
          </div>
        )}

        {/* Error state */}
        {error && !loading && (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#0f172a]"
            role="alert"
          >
            <p className="text-red-400 text-sm max-w-md text-center">{error}</p>
            <button
              onClick={() => setError(null)}
              className="text-xs px-3 py-1 rounded-md bg-slate-700 hover:bg-slate-600 text-slate-200 transition-colors"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Empty state — no data indexed yet */}
        {isEmpty && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#0f172a]">
            <p className="text-slate-400 text-sm max-w-sm text-center">
              No graph data yet. Index some files to see relationships.
            </p>
          </div>
        )}

        {/* ReactFlow canvas — rendered even when expanding so the graph stays
            visible while new neighbours are being fetched */}
        {!loading && !error && !isEmpty && (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={onNodeClick}
            fitView
            // Dark background matching the app shell
            style={{ background: '#0f172a' }}
            // Prevent the default white node style from interfering with our
            // custom per-node styles defined in entityToNode
            nodesDraggable
            nodesConnectable={false}
            elementsSelectable
            aria-label="Knowledge graph visualisation"
          >
            {/* Grid dots give depth perception on the dark canvas */}
            <Background color="#1e293b" gap={20} />
            {/* Zoom / fit controls in the bottom-left corner */}
            <Controls />
          </ReactFlow>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Legend                                                               */}
      {/* ------------------------------------------------------------------ */}
      {!loading && !isEmpty && (
        <div
          className="flex flex-wrap items-center gap-4 px-4 py-2 border-t border-slate-800 bg-slate-900/80"
          aria-label="Node colour legend"
        >
          {(Object.entries(NODE_COLORS) as [string, string][])
            .filter(([type]) => type !== 'FILE')
            .map(([type, color]) => (
              <div key={type} className="flex items-center gap-1.5">
                <span
                  className="inline-block rounded-full"
                  style={{ width: 10, height: 10, background: color }}
                  aria-hidden="true"
                />
                <span className="text-xs text-slate-400">{type}</span>
              </div>
            ))}
          <div className="flex items-center gap-1.5">
            <span
              className="inline-block rounded-full"
              style={{ width: 10, height: 10, background: DEFAULT_NODE_COLOR }}
              aria-hidden="true"
            />
            <span className="text-xs text-slate-400">OTHER</span>
          </div>
        </div>
      )}
    </div>
  );
}
