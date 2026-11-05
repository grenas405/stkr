// Computes node positions up front. d3-force seeds its randomness itself, so the same
// graph always gets the same layout.

import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY } from 'd3-force';
import type { SimulationLinkDatum, SimulationNodeDatum } from 'd3-force';
import type { Graph } from '../core/graph';

export type Positions = ReadonlyMap<string, { readonly x: number; readonly y: number }>;

export type Bounds = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

type SimNode = SimulationNodeDatum & { id: string; radius: number };

const TICKS = 300;
// Room around each node for its label, since labels sit below the disc.
const LABEL_CLEARANCE = 34;
// Keeps a small collection from being magnified until its labels collide.
const MIN_VIEW = { width: 760, height: 520 };
const MIN_VIEW_PORTRAIT = { width: 420, height: 520 };

export const nodeRadius = (kind: 'map' | 'stack', size: number): number =>
  kind === 'map' ? 22 : 22 + Math.sqrt(size) * 6;

// `portrait` pulls nodes into a tall column for narrow screens.
export const layoutGraph = (graph: Graph, portrait = false): Positions => {
  const nodes: SimNode[] = graph.nodes.map((node) => ({
    id: node.id,
    radius: nodeRadius(node.kind, node.size),
  }));
  const links: SimulationLinkDatum<SimNode>[] = graph.edges.map((edge) => ({
    source: edge.source,
    target: edge.target,
  }));
  const weights = graph.edges.map((edge) => edge.weight);
  const heaviest = Math.max(1, ...weights);
  forceSimulation(nodes)
    .force(
      'link',
      forceLink<SimNode, SimulationLinkDatum<SimNode>>(links)
        .id((node) => node.id)
        .distance(130)
        .strength((_, index) => 0.1 + ((weights[index] ?? 0) / heaviest) * 0.5),
    )
    .force('charge', forceManyBody().strength(-520))
    // Gravity instead of a plain center, so unlinked clusters stay close together.
    .force('x', forceX(0).strength(portrait ? 0.16 : 0.05))
    .force('y', forceY(0).strength(portrait ? 0.04 : 0.08))
    .force('collide', forceCollide<SimNode>().radius((node) => node.radius + LABEL_CLEARANCE))
    .stop()
    .tick(TICKS);
  return new Map(nodes.map((node) => [node.id, { x: node.x ?? 0, y: node.y ?? 0 }]));
};

export const boundsOf = (positions: Positions, portrait = false, padding = 70): Bounds => {
  const minimum = portrait ? MIN_VIEW_PORTRAIT : MIN_VIEW;
  const points = [...positions.values()];
  if (points.length === 0) return { x: -200, y: -150, width: 400, height: 300 };
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const [minX, minY] = [Math.min(...xs) - padding, Math.min(...ys) - padding];
  const [maxX, maxY] = [Math.max(...xs) + padding, Math.max(...ys) + padding];
  const width = Math.max(maxX - minX, minimum.width);
  const height = Math.max(maxY - minY, minimum.height);
  return {
    x: (minX + maxX) / 2 - width / 2,
    y: (minY + maxY) / 2 - height / 2,
    width,
    height,
  };
};
